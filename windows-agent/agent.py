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
MAX_PAIR_ATTEMPTS = 5
REQUEST_WINDOW_SECONDS = 30
MAX_BODY_BYTES = 512 * 1024
MAX_FILE_BYTES = 128 * 1024
MAX_COMMAND_CHARS = 1200
MAX_COMMAND_OUTPUT_CHARS = 12_000
ROOTS = [Path.home() / "Desktop", Path.home() / "Documents", Path.home() / "Downloads"]
DESTRUCTIVE_ACTIONS = {
    "DELETE_FILE", "RESTART_PC", "SHUTDOWN_PC", "SLEEP_PC",
    "PROCESS_CONTROL", "WRITE_FILE", "RUN_COMMAND",
}
ALLOWED_ACTIONS = {
    "OPEN_APPLICATION",
    "OPEN_FOLDER",
    "OPEN_FILE",
    "SEARCH_FILES",
    "LIST_FILES",
    "READ_FILE",
    "WRITE_FILE",
    "RUN_COMMAND",
    "SHOW_DESKTOP",
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
    # Paths are checked by their resolved location, not the 240-character name
    # limit used for short user-supplied labels.
    if not isinstance(value, str) or not value.strip():
        raise ValueError("path must be a non-empty string")
    requested = Path(value.strip()).expanduser().resolve()
    allowed = [root.resolve() for root in ROOTS if root.exists()]
    if not any(requested == root or root in requested.parents for root in allowed):
        raise PermissionError("The agent only permits Desktop, Documents, and Downloads.")
    return requested


def resolve_folder(value: Any) -> Path:
    """Resolve a friendly folder name or an explicit path inside an allowed root."""
    if isinstance(value, str):
        aliases = {
            "desktop": Path.home() / "Desktop",
            "documents": Path.home() / "Documents",
            "downloads": Path.home() / "Downloads",
        }
        root = aliases.get(value.strip().casefold())
        if root is not None:
            return resolve_user_path(str(root))
    return resolve_user_path(value)


DISCOVERY_TIME_BUDGET_SECONDS = 1.5
DISCOVERY_MAX_ENTRIES = 4_000
DISCOVERY_MAX_DEPTH = 4
# Folders that never hold user documents worth searching and can be enormous.
DISCOVERY_SKIP_DIRECTORIES = {
    "node_modules", ".git", ".cache", "$recycle.bin", "system volume information",
    "appdata", "windows", "program files", "program files (x86)",
}


def iter_entries(root: Path, deadline: float, skip_directories: set[str] | None = None):
    """Depth- and time-bounded file walk.

    A Downloads or Documents folder can contain hundreds of thousands of files;
    an unbounded scan would stall the request far past the phone's timeout.
    """
    stack: list[tuple[Path, int]] = [(root, 0)]
    inspected = 0
    while stack:
        current, depth = stack.pop()
        if time.monotonic() > deadline or inspected >= DISCOVERY_MAX_ENTRIES:
            return
        try:
            with os.scandir(current) as items:
                for item in items:
                    inspected += 1
                    if inspected >= DISCOVERY_MAX_ENTRIES or time.monotonic() > deadline:
                        return
                    try:
                        is_directory = item.is_dir(follow_symlinks=False)
                    except OSError:
                        continue
                    if is_directory:
                        if depth < DISCOVERY_MAX_DEPTH and item.name.casefold() not in (skip_directories or set()):
                            stack.append((Path(item.path), depth + 1))
                    else:
                        yield Path(item.path)
        except OSError:
            continue


def discover_file(name: str) -> list[Path]:
    needle = name.casefold()
    matches: list[Path] = []
    deadline = time.monotonic() + DISCOVERY_TIME_BUDGET_SECONDS
    for root in ROOTS:
        if not root.exists() or len(matches) >= 50 or time.monotonic() > deadline:
            continue
        for path in iter_entries(root, deadline, DISCOVERY_SKIP_DIRECTORIES):
            if needle not in path.name.casefold():
                continue
            try:
                safe_path = resolve_user_path(str(path))
            except (OSError, PermissionError, ValueError):
                continue
            if safe_path.name.casefold() == needle or needle in safe_path.name.casefold():
                matches.append(safe_path)
                if len(matches) >= 50:
                    return matches
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
    best: Path | None = None
    best_key: tuple[bool, int] | None = None
    deadline = time.monotonic() + DISCOVERY_TIME_BUDGET_SECONDS
    for root in search_roots:
        if not root or not root.exists() or time.monotonic() > deadline:
            continue
        for path in iter_entries(root, deadline):
            if path.suffix.casefold() not in {".exe", ".lnk"} or needle not in path.stem.casefold():
                continue
            key = (path.suffix != ".lnk", len(str(path)))
            if best_key is None or key < best_key:
                best, best_key = path, key
    return best


def open_path(path: Path) -> str:
    if os.name != "nt":
        raise RuntimeError("Opening Windows applications is only supported on Windows.")
    os.startfile(str(path))  # type: ignore[attr-defined]
    return str(path)


def interpret_text(text: str) -> tuple[str, dict[str, Any]]:
    normalized = text.casefold().strip()
    normalized = normalized.rstrip(" .!?")
    if normalized.startswith(("show cpu", "show system", "system status", "how much ram", "how much storage", "battery")):
        return "SYSTEM_INFO", {}
    if normalized in {"show desktop", "show my desktop", "show me the desktop", "minimize everything"}:
        return "SHOW_DESKTOP", {}
    folder_aliases = {
        "open my files": "Documents",
        "open file explorer": "Documents",
        "open explorer": "Documents",
        "open downloads": "Downloads",
        "open downloads folder": "Downloads",
        "open documents": "Documents",
        "open documents folder": "Documents",
        "open desktop": "Desktop",
        "open desktop folder": "Desktop",
    }
    if normalized in folder_aliases:
        return "OPEN_FOLDER", {"path": folder_aliases[normalized]}
    if normalized.startswith(("lock my", "lock the")):
        return "LOCK_PC", {}
    if normalized.startswith(("restart", "reboot")):
        return "RESTART_PC", {}
    if normalized.startswith(("shut down", "shutdown")):
        return "SHUTDOWN_PC", {}
    if normalized.startswith(("put my laptop to sleep", "sleep my")):
        return "SLEEP_PC", {}
    if normalized.startswith(("open folder ", "browse folder ")):
        return "OPEN_FOLDER", {"name": text.split(" ", 2)[2].strip()}
    if normalized.startswith(("open file ", "find file ")):
        return "OPEN_FILE", {"name": text.split(" ", 2)[2].strip()}
    if normalized.startswith(("read file ", "read the file ")):
        target = text.split(" ", 2)[2].strip() if normalized.startswith("read file ") else text.split(" ", 3)[3].strip()
        return "READ_FILE", {"name": target}
    if normalized.startswith(("open ", "launch ")):
        target = text.split(" ", 1)[1].strip()
        matches = [path for path in discover_file(target) if path.is_file()]
        if len(matches) == 1:
            return "OPEN_FILE", {"path": str(matches[0])}
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
    if action == "SHOW_DESKTOP":
        if os.name != "nt":
            raise RuntimeError("Showing the desktop is only supported on Windows.")
        import ctypes
        keybd_event = ctypes.windll.user32.keybd_event
        keybd_event(0x5B, 0, 0, 0)  # Left Windows key
        keybd_event(0x44, 0, 0, 0)  # D
        keybd_event(0x44, 0, 2, 0)
        keybd_event(0x5B, 0, 2, 0)
        return {"success": True, "message": "Desktop shown."}
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
        windows = Path(os.environ.get("SystemRoot", r"C:\Windows"))
        built_in_apps = {
            "task manager": windows / "System32" / "Taskmgr.exe",
            "taskmgr": windows / "System32" / "Taskmgr.exe",
            "command prompt": Path(os.environ.get("COMSPEC", str(windows / "System32" / "cmd.exe"))),
            "cmd": Path(os.environ.get("COMSPEC", str(windows / "System32" / "cmd.exe"))),
            "powershell": windows / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe",
        }
        built_in = built_in_apps.get(target.casefold())
        if built_in and built_in.exists():
            return {"success": True, "message": f"{target} opened successfully.", "data": {"path": open_path(built_in)}}
        path = discover_application(target)
        if not path:
            return {"success": False, "message": f"{target} was not found on the laptop."}
        return {"success": True, "message": f"{target} opened successfully.", "data": {"path": open_path(path)}}
    if action == "OPEN_FOLDER":
        if parameters.get("path"):
            path = resolve_folder(parameters.get("path"))
            if not path.is_dir():
                return {"success": False, "message": "That folder does not exist."}
            return {"success": True, "message": "Folder opened successfully.", "data": {"path": open_path(path)}}
        target = safe_name(parameters.get("name"), "name")
        matches = [path for path in discover_file(target) if path.is_dir()]
        if len(matches) != 1:
            return {"success": False, "message": f"Found {len(matches)} folders named {target}; choose one explicitly."}
        return {"success": True, "message": f"{target} opened successfully.", "data": {"path": open_path(matches[0])}}
    if action == "OPEN_FILE":
        path_value = parameters.get("path")
        if path_value:
            path = resolve_user_path(path_value)
            matches = [path] if path.is_file() else []
        else:
            target = safe_name(parameters.get("name"), "name")
            matches = [path for path in discover_file(target) if path.is_file()]
        if not matches:
            return {"success": False, "message": "No matching file was found in Desktop, Documents, or Downloads."}
        if len(matches) != 1:
            return {"success": False, "message": f"Found {len(matches)} matching files. Use the file browser to choose one.", "data": {"matches": [str(path) for path in matches[:20]]}}
        return {"success": True, "message": "File opened successfully.", "data": {"path": open_path(matches[0])}}
    if action == "LIST_FILES":
        directory = resolve_folder(parameters.get("path", "Documents"))
        if not directory.is_dir():
            return {"success": False, "message": "That folder does not exist."}
        entries = []
        try:
            for child in sorted(directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold())):
                try:
                    safe_child = resolve_user_path(str(child))
                    stat = safe_child.stat()
                    entries.append({
                        "name": safe_child.name,
                        "path": str(safe_child),
                        "is_directory": safe_child.is_dir(),
                        "size": stat.st_size if safe_child.is_file() else None,
                        "modified": stat.st_mtime,
                    })
                except (OSError, PermissionError):
                    continue
                if len(entries) >= 100:
                    break
        except OSError:
            return {"success": False, "message": "The agent could not list that folder."}
        return {"success": True, "message": f"Showing {len(entries)} items.", "data": {"path": str(directory), "entries": entries}}
    if action == "READ_FILE":
        if parameters.get("path"):
            path = resolve_user_path(parameters.get("path"))
        else:
            target = safe_name(parameters.get("name"), "name")
            matches = [candidate for candidate in discover_file(target) if candidate.is_file()]
            if len(matches) != 1:
                return {"success": False, "message": f"Found {len(matches)} matching files. Use the file browser to choose one.", "data": {"matches": [str(candidate) for candidate in matches[:20]]}}
            path = resolve_user_path(str(matches[0]))
        if not path.is_file():
            return {"success": False, "message": "That file does not exist."}
        if path.stat().st_size > MAX_FILE_BYTES:
            return {"success": False, "message": f"Files larger than {MAX_FILE_BYTES // 1024} KB cannot be opened in the phone editor."}
        raw = path.read_bytes()
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("This file is not UTF-8 text and cannot be edited in the phone editor.") from error
        if "\x00" in content:
            raise ValueError("This file appears to be binary and cannot be edited in the phone editor.")
        return {"success": True, "message": "Text file opened.", "data": {"path": str(path), "content": content}}
    if action == "WRITE_FILE":
        path = resolve_user_path(parameters.get("path"))
        content = parameters.get("content")
        if not isinstance(content, str):
            raise ValueError("File contents must be text.")
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_FILE_BYTES:
            raise ValueError(f"Edited files cannot exceed {MAX_FILE_BYTES // 1024} KB.")
        if path.exists() and not path.is_file():
            raise ValueError("The selected path is not a file.")
        if not path.parent.is_dir():
            raise ValueError("The parent folder does not exist.")
        backup_path = None
        if path.exists():
            backup_path = path.with_name(f"{path.name}.laptop-remote-{time.time_ns()}.bak")
            shutil.copy2(path, backup_path)
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, prefix=".laptop-remote-", delete=False) as temporary:
                temporary.write(encoded)
                temporary_path = Path(temporary.name)
            os.replace(temporary_path, path)
        finally:
            if temporary_path and temporary_path.exists():
                temporary_path.unlink()
        return {"success": True, "message": "File saved.", "data": {"path": str(path), "backup": str(backup_path) if backup_path else None, "bytes_written": len(encoded)}}
    if action == "RUN_COMMAND":
        command = parameters.get("command")
        if not isinstance(command, str) or not command.strip() or len(command) > MAX_COMMAND_CHARS or "\x00" in command:
            raise ValueError(f"Enter a command between 1 and {MAX_COMMAND_CHARS} characters.")
        if os.name != "nt":
            raise RuntimeError("The remote terminal is only supported on Windows.")
        powershell = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        try:
            completed = subprocess.run(
                [str(powershell), "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
                cwd=str(Path.home()),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
                shell=False,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout.decode("utf-8", errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
            stderr = error.stderr.decode("utf-8", errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
            return {"success": False, "message": "Command timed out after 20 seconds.", "data": {"stdout": stdout[-MAX_COMMAND_OUTPUT_CHARS:], "stderr": stderr[-MAX_COMMAND_OUTPUT_CHARS:], "timed_out": True}}
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        truncated = len(stdout) > MAX_COMMAND_OUTPUT_CHARS or len(stderr) > MAX_COMMAND_OUTPUT_CHARS
        return {
            "success": completed.returncode == 0,
            "message": "Command completed." if completed.returncode == 0 else f"Command exited with code {completed.returncode}.",
            "data": {
                "exit_code": completed.returncode,
                "stdout": stdout[-MAX_COMMAND_OUTPUT_CHARS:],
                "stderr": stderr[-MAX_COMMAND_OUTPUT_CHARS:],
                "truncated": truncated,
            },
        }
    if action == "SEARCH_FILES":
        query = safe_name(parameters.get("query"), "query").casefold()
        results = []
        for root in ROOTS:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                try:
                    path = resolve_user_path(str(path))
                except (OSError, PermissionError):
                    continue
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
        self.pair_attempts = 0
        self.tokens: set[str] = set()
        self.nonces: dict[str, float] = {}

    def pair(self, code: str) -> str:
        with self.lock:
            if self.pair_attempts >= MAX_PAIR_ATTEMPTS:
                raise PermissionError("Too many pairing attempts. Restart the agent to generate a new code.")
            if time.time() > self.pairing_expires:
                raise PermissionError("The pairing code is invalid or expired.")
            if not secrets.compare_digest(code, self.pairing_code):
                self.pair_attempts += 1
                if self.pair_attempts >= MAX_PAIR_ATTEMPTS:
                    self.pairing_code = ""
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


def local_addresses() -> list[str]:
    """Non-loopback IPv4 addresses the phone can actually reach."""
    addresses: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if address not in addresses and not address.startswith("127."):
                addresses.append(address)
    except OSError:
        pass
    return addresses


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
    for address in local_addresses():
        print(f"Enter this address on your phone: {scheme}://{address}:{args.port}")
    print(f"One-time pairing code: {state.pairing_code}")
    print("If the phone cannot connect, allow Python through Windows Firewall for private networks.")
    print("Keep this window open while pairing. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping agent.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()