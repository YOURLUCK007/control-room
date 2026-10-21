import json
import tempfile
import threading
import time
import urllib.error
import urllib.request
import unittest
from pathlib import Path
from unittest.mock import patch

from windows_agent import agent


class AgentProtocolTests(unittest.TestCase):
    def test_natural_language_is_deterministically_allowlisted(self):
        self.assertEqual(agent.interpret_text("Open Microsoft Edge"), ("OPEN_APPLICATION", {"name": "Microsoft Edge"}))
        self.assertEqual(agent.interpret_text("Show CPU usage"), ("SYSTEM_INFO", {}))
        self.assertEqual(agent.interpret_text("Create a folder called College"), ("CREATE_FOLDER", {"name": "College", "parent": str(Path.home() / "Documents")}))
        self.assertEqual(agent.interpret_text("Open Downloads folder"), ("OPEN_FOLDER", {"path": "Downloads"}))
        self.assertEqual(agent.interpret_text("Show my desktop"), ("SHOW_DESKTOP", {}))
        self.assertEqual(agent.interpret_text("Read file notes.txt"), ("READ_FILE", {"name": "notes.txt"}))

    def test_unknown_text_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.interpret_text("Run an arbitrary command")

    def test_pairing_is_one_time_and_nonce_is_replay_protected(self):
        with tempfile.TemporaryDirectory() as directory:
            state = agent.AgentState(Path(directory))
            token = state.pair(state.pairing_code)
            timestamp = str(time.time())
            self.assertTrue(state.authenticated(token, timestamp, "nonce-1"))
            self.assertFalse(state.authenticated(token, timestamp, "nonce-1"))
            with self.assertRaises(PermissionError):
                state.pair("000000")

    def test_pairing_locks_after_five_wrong_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            state = agent.AgentState(Path(directory))
            correct_code = state.pairing_code
            for _ in range(agent.MAX_PAIR_ATTEMPTS):
                with self.assertRaises(PermissionError):
                    state.pair("wrong-code")
            self.assertEqual(state.pairing_code, "")
            with self.assertRaisesRegex(PermissionError, "Too many pairing attempts"):
                state.pair(correct_code)

    def test_http_pairing_telemetry_and_confirmation_response(self):
        with tempfile.TemporaryDirectory() as directory:
            state = agent.AgentState(Path(directory))
            server = agent.build_server("127.0.0.1", 0, state, None, None, allow_insecure=True)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_address[1]}"
            try:
                pair_request = urllib.request.Request(
                    f"{base}/pair",
                    data=json.dumps({"code": state.pairing_code}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(pair_request) as response:
                    paired = json.loads(response.read())
                token = paired["access_token"]

                def authenticated_request(action, parameters, confirm, nonce):
                    timestamp = str(int(time.time()))
                    request = urllib.request.Request(
                        f"{base}/command",
                        data=json.dumps({"action": action, "parameters": parameters, "confirm": confirm}).encode(),
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {token}",
                            "X-Laptop-Remote-Timestamp": timestamp,
                            "X-Laptop-Remote-Nonce": nonce,
                        },
                        method="POST",
                    )
                    return request

                telemetry_request = authenticated_request("SYSTEM_INFO", {}, False, "telemetry-1")
                with urllib.request.urlopen(telemetry_request) as response:
                    telemetry = json.loads(response.read())
                self.assertTrue(telemetry["success"])
                self.assertIn("hostname", telemetry["data"])

                terminal_request = authenticated_request("RUN_COMMAND", {"command": "Get-ChildItem"}, False, "terminal-1")
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(terminal_request)
                self.assertEqual(error.exception.code, 409)
                self.assertTrue(json.loads(error.exception.read())["requires_confirmation"])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)

    def test_destructive_actions_need_confirmation(self):
        response = agent.execute_action("SHUTDOWN_PC", {}, confirmed=False)
        self.assertTrue(response["requires_confirmation"])

    def test_path_boundary_is_enforced(self):
        with self.assertRaises(PermissionError):
            agent.resolve_user_path(str(Path.home() / "AppData"))

    def test_file_browser_and_editor_stay_inside_allowed_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            notes = root / "notes.txt"
            notes.write_text("old notes", encoding="utf-8")
            with patch.object(agent, "ROOTS", [root]):
                listing = agent.execute_action("LIST_FILES", {"path": str(root)}, confirmed=False)
                self.assertEqual(listing["data"]["entries"][0]["name"], "notes.txt")
                read = agent.execute_action("READ_FILE", {"path": str(notes)}, confirmed=False)
                self.assertEqual(read["data"]["content"], "old notes")
                denied = agent.execute_action("WRITE_FILE", {"path": str(notes), "content": "new notes"}, confirmed=False)
                self.assertTrue(denied["requires_confirmation"])
                saved = agent.execute_action("WRITE_FILE", {"path": str(notes), "content": "new notes"}, confirmed=True)
                self.assertEqual(notes.read_text(encoding="utf-8"), "new notes")
                self.assertEqual(Path(saved["data"]["backup"]).read_text(encoding="utf-8"), "old notes")
                with self.assertRaises(PermissionError):
                    agent.execute_action("READ_FILE", {"path": str(root.parent / "outside.txt")}, confirmed=False)

    def test_remote_terminal_requires_confirmation_and_has_a_platform_boundary(self):
        response = agent.execute_action("RUN_COMMAND", {"command": "Get-ChildItem"}, confirmed=False)
        self.assertTrue(response["requires_confirmation"])
        with self.assertRaises(RuntimeError):
            agent.execute_action("RUN_COMMAND", {"command": "Get-ChildItem"}, confirmed=True)

    def test_text_editor_rejects_binary_and_oversized_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "binary.dat"
            binary.write_bytes(b"\x00\xff")
            large = root / "large.txt"
            large.write_bytes(b"a" * (agent.MAX_FILE_BYTES + 1))
            with patch.object(agent, "ROOTS", [root]):
                with self.assertRaises(ValueError):
                    agent.execute_action("READ_FILE", {"path": str(binary)}, confirmed=False)
                too_large = agent.execute_action("READ_FILE", {"path": str(large)}, confirmed=False)
                self.assertFalse(too_large["success"])


if __name__ == "__main__":
    unittest.main()