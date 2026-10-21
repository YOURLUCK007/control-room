# Laptop Remote

Laptop Remote is an Android companion for controlling a Windows laptop over a trusted local network. Pairing and everyday commands stay on the LAN; device tokens and command history are stored on the phone. Natural-language commands map to explicit Windows actions, while file editing and the remote PowerShell terminal use dedicated screens with separate safeguards.

## Project structure

```text
artifacts/phone-laptop-remote/   Expo Android client
windows-agent/                   Python Windows agent
docs/                            Architecture, security, protocol, and operations docs
tests/                           Agent protocol and safety tests
```

## Run the Android client

The project is an Expo app. Use the managed preview workflow from Replit, or run the package's development command in an Expo-compatible environment:

```bash
pnpm --filter @workspace/phone-laptop-remote run dev
```

Preview it with Expo Go using the QR action in the mobile preview. To pair a laptop, run the Windows agent and use the host, port, and one-time code shown by the agent. On native phones, dictate into the command box using the phone keyboard's microphone. The browser mic button is available only where the browser implements the Web Speech API; review its transcript before sending.

## Run the Windows agent

On Windows:

```powershell
cd windows-agent
py -m pip install -r requirements.txt
py agent.py --allow-insecure-dev
```

The insecure flag is intentionally explicit for a trusted development LAN. For normal use, provide a TLS certificate and private key:

```powershell
py agent.py --host 0.0.0.0 --cert .\certs\agent.crt --key .\certs\agent.key
```

The agent prints a one-time six-digit pairing code. Enter the laptop host, port, and code in the Android app. Local-only mode is on by default and blocks public internet hosts. Keep the agent on the LAN; do not port-forward it. Five wrong pairing codes lock pairing until the agent restarts.

## What the phone can do

- Open common Windows folders and launch files or installed applications.
- Browse Desktop, Documents, and Downloads; read and edit UTF-8 text files up to 128 KB. Saving requires confirmation and keeps a timestamped backup beside an existing file.
- Run PowerShell commands in a dedicated terminal. Every command requires an explicit confirmation, runs as the logged-in Windows user, is limited to 1,200 characters and a 20-second wait, and returns bounded output. This is powerful remote code execution: pair only your own phone, use TLS, and keep the agent private to your LAN.
- Read system telemetry and perform supported power actions, with confirmation for disruptive operations.

The dashboard does not support arbitrary natural-language shell execution. Full computer control is not possible when Windows is fully shut down: the agent must be running. Wake-on-LAN is not implemented.

If you disable Local-only mode, the app requires `https://` for non-local hosts; it does not provide a relay or VPN. Prefer a private VPN and a valid TLS certificate rather than exposing the agent directly.

## Checks

```bash
pnpm run typecheck
python -m py_compile windows-agent/agent.py
python -m unittest discover -s tests -p 'test_*.py'
```

The mobile app has no dedicated native speech-recognition dependency; in Expo Go, native voice entry uses the phone keyboard's own dictation feature. Browser speech recognition may use the browser vendor's speech service.

See:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `docs/manual-testing.md`