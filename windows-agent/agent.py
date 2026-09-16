from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import platform
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

try:
    import psutil
except ImportError:  # pragma: no cover - the agent still starts without telemetry extras
    psutil = None


APP_NAME = "Laptop Remote"
PAIRING_TTL_SECONDS = 600
REQUEST_WINDOW_SECONDS = 30
MAX_BODY_BYTES = 64 * 1024
ROOTS = [Path.home() / "Desktop", Path.home() / "Documents", Path.home() / "Downloads"]
DESTRUCTIVE_ACTIONS = {"DELETE_FILE", "RESTART_PC", "SHUTDOWN_PC", "SLEEP_PC", "PROCESS_CONTROL"}
ALLOWED_ACTIONS = {
    "OPEN_APPLICATION",
    "OPEN_FOLDER",
    "SEARCH_FILES",
    "CREATE_FOLDER",
    "COPY_FILE",
    "MOVE_FILE",
    "RENAME_FILE",
    "DELETE_FILE",
    "SYSTEM_INFO",
    "SCREENSHOT",
    "LOCK_PC",
    "SLEEP_PC",
    "RESTART_PC",
    "SHUTDOWN_PC",
    "MEDIA_CONTROL",
    "VOLUME_CONTROL",
    "BRIGHTNESS_CONTROL",
    "CLIPBOARD",
    "PROCESS_CONTROL",
    "NETWORK_STATUS",
    "BATTERY_STATUS",
    "STORAGE_STATUS",
    "NATURAL_LANGUAGE",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def safe_name(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 240:
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def resolve_user_path(value: Any) -> Path:
    requested = Path(safe_name(value, "path")).expanduser().resolve()
    allowed = [root.resolve() for root in ROOTS if root.exists()]
    if not any(requested == root or root in requested.parents for root in allowed):
        raise PermissionError("The agent only permits Desktop, Documents, and Downloads.")
    return requested


def discover_file(name: str) -> list[Path]:
    needle = name.casefold()
    matches: list[Path] = []
    for root in ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if len(matches) >= 50:
                return matches
            if path.name.casefold() == needle or needle in path.name.casefold():
                matches.append(path)
    return matches


def discover_application(name: str) -> Path | None:
    needle = name.casefold().replace(".exe", "")
    search_roots = [
        Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
        Path(os.environ.get("PROGRAMDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs",
        Path(os.environ.get("PROGRAMFILES", "")),
        Path(os.environ.get("PROGRAMFILES(X86)", "")),
    ]
    candidates: list[Path] = []
    for root in search_roots:
        if not root or not root.exists():
            continue
        try:
            candidates.extend(
                path
                for path in root.rglob("*")
                if needle in path.stem.casefold() and path.suffix.casefold() in {".exe", ".lnk"}
            )
        except OSError:
            continue
    return sorted(candidates, key=lambda path: (path.suffix != ".lnk", len(str(path))))[0] if candidates else None


def open_path(path: Path) -> str:
    if os.name != "nt":
        raise RuntimeError("Opening Windows applications is only supported on Windows.")
    os.startfile(str(path))  # type: ignore[attr-defined]
    return str(path)


def interpret_text(text: str) -> tuple[str, dict[str, Any]]:
    normalized = text.casefold().strip()
    if normalized.startswith(("show cpu", "show system", "system status", "how much ram", "how much storage", "battery")):
        return "SYSTEM_INFO", {}
    if normalized.startswith(("take a screenshot", "screenshot")):
        return "SCREENSHOT", {}
    if normalized.startswith(("lock my", "lock the")):
        return "LOCK_PC", {}
    if normalized.startswith(("restart", "reboot")):
        return "RESTART_PC", {}
    if normalized.startswith(("shut down", "shutdown")):
        return "SHUTDOWN_PC", {}
    if normalized.startswith(("put my laptop to sleep", "sleep my")):
        return "SLEEP_PC", {}
    if normalized.startswith(("open ", "launch ")):
        target = text.split(" ", 1)[1].strip()
        return "OPEN_APPLICATION", {"name": target}
    if "find " in normalized or normalized.startswith("search "):
        target = text.split(" ", 1)[1].strip()
        return "SEARCH_FILES", {"query": target}
    if normalized.startswith("create a folder called "):
        return "CREATE_FOLDER", {"name": text[len("create a folder called ") :].strip(), "parent": str(Path.home() / "Documents")}
    if "volume up" in normalized or "increase volume" in normalized:
        return "VOLUME_CONTROL", {"direction": "up"}
    if "volume down" in normalized or "decrease volume" in normalized:
        return "VOLUME_CONTROL", {"direction": "down"}
    if "mute" in normalized:
        return "VOLUME_CONTROL", {"direction": "mute"}
    raise ValueError("I could not map that request to a permitted action yet.")


def execute_action(action: str, parameters: dict[str, Any], confirmed: bool) -> dict[str, Any]:
    if action not in ALLOWED_ACTIONS:
        raise ValueError("That action is not permitted by the Windows agent.")
    if action in DESTRUCTIVE_ACTIONS and not confirmed:
        return {"success": False, "requires_confirmation": True, "message": "This action requires confirmation."}

    if action == "NATURAL_LANGUAGE":
        action, parameters = interpret_text(safe_name(parameters.get("text"), "text"))
        return execute_action(action, parameters, confirmed)
    if action == "SYSTEM_INFO":
        return {"success": True, "message": "System information collected.", "data": telemetry()}
    if action == "NETWORK_STATUS":
        return {"success": True, "message": "Network status collected.", "data": {"hostname": socket.gethostname(), "ip": socket.gethostbyname(socket.gethostname())}}
    if action == "BATTERY_STATUS":
        data = telemetry()
        return {"success": True, "message": "Battery status collected.", "data": {"battery": data.get("battery")}}
    if action == "STORAGE_STATUS":
        drive = Path.home().anchor or "C:\\"
        usage = shutil.disk_usage(drive)
        return {"success": True, "message": "Storage status collected.", "data": {"drive": drive, "free_bytes": usage.free, "total_bytes": usage.total}}
    if action == "OPEN_APPLICATION":
        target = safe_name(parameters.get("name"), "name")
        path = discover_application(target)
        if not path:
            return {"success": False, "message": f"{target} was not found on the laptop."}
        return {"success": True, "message": f"{target} opened successfully.", "data": {"path": open_path(path)}}
    if action == "OPEN_FOLDER":
        target = safe_name(parameters.get("name"), "name")
        matches = [path for path in discover_file(target) if path.is_dir()]
        if len(matches) != 1:
            return {"success": False, "message": f"Found {len(matches)} folders named {target}; choose one explicitly."}
        return {"success": True, "message": f"{target} opened successfully.", "data": {"path": open_path(matches[0])}}
    if action == "SEARCH_FILES":
        query = safe_name(parameters.get("query"), "query").casefold()
        results = []
        for root in ROOTS:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if query in path.name.casefold():
                    results.append({"name": path.name, "path": str(path), "is_directory": path.is_dir(), "modified": path.stat().st_mtime})
                if len(results) >= 50:
                    break
        return {"success": True, "message": f"Found {len(results)} matching items.", "data": {"results": results}}
    if action == "CREATE_FOLDER":
        parent = resolve_user_path(parameters.get("parent", str(Path.home() / "Documents")))
        destination = (parent / safe_name(parameters.get("name"), "name")).resolve()
        resolve_user_path(str(destination))
        destination.mkdir(parents=False, exist_ok=False)
        return {"success": True, "message": "Folder created.", "data": {"path": str(destination)}}
    if action in {"COPY_FILE", "MOVE_FILE", "RENAME_FILE", "DELETE_FILE"}:
        source = resolve_user_path(parameters.get("source"))
        if not source.exists():
            return {"success": False, "message": "The requested file or folder does not exist."}
        if action == "DELETE_FILE":
            shutil.rmtree(source) if source.is_dir() else source.unlink()
            return {"success": True, "message": "The item was deleted."}
        destination = resolve_user_path(parameters.get("destination"))
        if action == "COPY_FILE":
            shutil.copytree(source, destination) if source.is_dir() else shutil.copy2(source, destination)
        elif action == "MOVE_FILE":
            shutil.move(str(source), str(destination))
        else:
            source.rename(destination)
        return {"success": True, "message": "The file operation completed.", "data": {"path": str(destination)}}
    if action == "LOCK_PC":
        if os.name != "nt":
            raise RuntimeError("Locking the workstation is only supported on Windows.")
        import ctypes
        ctypes.windll.user32.LockWorkStation()
        return {"success": True, "message": "Laptop locked."}
    if action in {"SLEEP_PC", "RESTART_PC", "SHUTDOWN_PC"}:
        if os.name != "nt":
            raise RuntimeError("This power action is only supported on Windows.")
        command = {"SLEEP_PC": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"], "RESTART_PC": ["shutdown", "/r", "/t", "0"], "SHUTDOWN_PC": ["shutdown", "/s", "/t", "0"]}[action]
        subprocess.Popen(command, shell=False)
        return {"success": True, "message": f"{action.replace('_', ' ').title()} requested."}
    if action == "SCREENSHOT":
        return {"success": False, "unsupported": True, "message": "Screen capture is not enabled in this agent build."}
    if action in {"MEDIA_CONTROL", "VOLUME_CONTROL", "BRIGHTNESS_CONTROL", "CLIPBOARD", "PROCESS_CONTROL"}:
        return {"success": False, "unsupported": True, "message": f"{action.replace('_', ' ').title()} is not enabled in this agent build."}
    raise ValueError("The action handler is not implemented.")


def telemetry() -> dict[str, Any]:
    result: dict[str, Any] = {"hostname": socket.gethostname(), "platform": platform.platform(), "timestamp": utc_now()}
    if psutil:
        result.update({
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": psutil.virtual_memory().percent,
            "memory_used_bytes": psutil.virtual_memory().used,
            "memory_total_bytes": psutil.virtual_memory().total,
            "uptime_seconds": int(time.time() - psutil.boot_time()),
        })
        battery = psutil.sensors_battery()
        if battery:
            result["battery"] = {"percent": battery.percent, "plugged": battery.power_plugged}
    return result


class AgentState:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.pairing_code = f"{secrets.randbelow(1_000_000):06d}"
        self.pairing_expires = time.time() + PAIRING_TTL_SECONDS
        self.tokens: set[str] = set()
        self.nonces: dict[str, float] = {}

    def pair(self, code: str) -> str:
        with self.lock:
            if time.time() > self.pairing_expires or not secrets.compare_digest(code, self.pairing_code):
                raise PermissionError("The pairing code is invalid or expired.")
            token = secrets.token_urlsafe(32)
            self.tokens.add(hashlib.sha256(token.encode()).hexdigest())
            self.pairing_code = ""
            return token

    def authenticated(self, token: str, timestamp: str, nonce: str) -> bool:
        try:
            request_time = float(timestamp)
        except (TypeError, ValueError):
            return False
        if abs(time.time() - request_time) > REQUEST_WINDOW_SECONDS or not nonce or len(nonce) > 128:
            return False
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.lock:
            if digest not in self.tokens or nonce in self.nonces:
                return False
            self.nonces[nonce] = time.time()
            self.nonces = {key: value for key, value in self.nonces.items() if time.time() - value < REQUEST_WINDOW_SECONDS}
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "LaptopRemote/1.0"

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is missing or too large.")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(HTTPStatus.OK, {"ok": True, "name": socket.gethostname(), "agent": APP_NAME, "protocol": "1"})
            return
        if self.path == "/pairing":
            state: AgentState = self.server.agent_state  # type: ignore[attr-defined]
            self.send_json(HTTPStatus.OK, {"name": socket.gethostname(), "pairing_expires_at": state.pairing_expires})
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "Endpoint not found."})

    def do_POST(self) -> None:
        try:
            payload = self.read_json()
            if self.path == "/pair":
                state: AgentState = self.server.agent_state  # type: ignore[attr-defined]
                token = state.pair(safe_name(payload.get("code"), "code"))
                self.send_json(HTTPStatus.OK, {"success": True, "access_token": token, "computer": {"id": socket.gethostname(), "name": socket.gethostname(), "os": platform.platform()}})
                return
            if self.path == "/telemetry":
                self.require_auth()
                self.send_json(HTTPStatus.OK, {"success": True, "data": telemetry()})
                return
            if self.path == "/command":
                self.require_auth()
                action = safe_name(payload.get("action"), "action")
                parameters = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}
                result = execute_action(action, parameters, bool(payload.get("confirm")))
                self.send_json(HTTPStatus.OK if result.get("success", False) else HTTPStatus.CONFLICT, result)
                return
            self.send_json(HTTPStatus.NOT_FOUND, {"success": False, "message": "Endpoint not found."})
        except PermissionError as error:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"success": False, "message": str(error)})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"success": False, "message": str(error)})
        except Exception as error:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"success": False, "message": "The agent could not complete that request.", "developer_error": str(error)})

    def require_auth(self) -> None:
        state: AgentState = self.server.agent_state  # type: ignore[attr-defined]
        header = self.headers.get("Authorization", "")
        timestamp = self.headers.get("X-Laptop-Remote-Timestamp", "")
        nonce = self.headers.get("X-Laptop-Remote-Nonce", "")
        if not header.startswith("Bearer ") or not state.authenticated(header[7:], timestamp, nonce):
            raise PermissionError("Authentication failed or the request was replayed.")

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write(f"[{utc_now()}] {self.address_string()} {format % args}\n")


def build_server(host: str, port: int, state: AgentState, cert: str | None, key: str | None, allow_insecure: bool) -> ThreadingHTTPServer:
    if bool(cert) != bool(key):
        raise ValueError("--cert and --key must be supplied together.")
    if not allow_insecure and not (cert and key):
        raise ValueError("TLS certificate and key are required. Use --allow-insecure-dev only on a trusted LAN.")
    server = ThreadingHTTPServer((host, port), Handler)
    server.agent_state = state  # type: ignore[attr-defined]
    if cert and key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(certfile=cert, keyfile=key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Laptop Remote Windows Agent")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", default=str(Path.home() / ".laptop-remote"))
    parser.add_argument("--cert")
    parser.add_argument("--key")
    parser.add_argument("--allow-insecure-dev", action="store_true")
    args = parser.parse_args()
    state = AgentState(Path(args.data_dir))
    server = build_server(args.host, args.port, state, args.cert, args.key, args.allow_insecure_dev)
    scheme = "https" if args.cert else "http"
    print(f"{APP_NAME} agent listening at {scheme}://{args.host}:{args.port}")
    print(f"One-time pairing code: {state.pairing_code}")
    print("Keep this window open while pairing. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping agent.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()