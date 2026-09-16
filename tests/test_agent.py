import tempfile
import time
import unittest
from pathlib import Path

from windows_agent import agent


class AgentProtocolTests(unittest.TestCase):
    def test_natural_language_is_deterministically_allowlisted(self):
        self.assertEqual(agent.interpret_text("Open Microsoft Edge"), ("OPEN_APPLICATION", {"name": "Microsoft Edge"}))
        self.assertEqual(agent.interpret_text("Show CPU usage"), ("SYSTEM_INFO", {}))
        self.assertEqual(agent.interpret_text("Create a folder called College"), ("CREATE_FOLDER", {"name": "College", "parent": str(Path.home() / "Documents")}))

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

    def test_destructive_actions_need_confirmation(self):
        response = agent.execute_action("SHUTDOWN_PC", {}, confirmed=False)
        self.assertTrue(response["requires_confirmation"])

    def test_path_boundary_is_enforced(self):
        with self.assertRaises(PermissionError):
            agent.resolve_user_path(str(Path.home() / "AppData"))


if __name__ == "__main__":
    unittest.main()