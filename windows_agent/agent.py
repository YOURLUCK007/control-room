"""Keep tests importable while the runnable source remains in windows-agent/agent.py."""

from pathlib import Path

_source = Path(__file__).resolve().parents[1] / "windows-agent" / "agent.py"
exec(compile(_source.read_text(encoding="utf-8"), str(_source), "exec"), globals())