# Laptop Remote

Laptop Remote is a secure Android companion for controlling a Windows laptop over a trusted local network. The mobile app stores paired computers and command history locally, while the Windows agent validates and executes only explicit allowlisted actions.

## Project structure

```text
artifacts/phone-laptop-remote/   Expo Android client
windows-agent/                   Python Windows tray/service foundation
shared/                          Protocol notes and future shared schemas
docs/                            Architecture, security, protocol, and operations docs
tests/                           Agent protocol and safety tests
```

## Run the Android client

The project is an Expo app. Use the managed preview workflow from Replit, or run the package's development command in an Expo-compatible environment:

```bash
pnpm --filter @workspace/phone-laptop-remote run dev
```

Preview it with Expo Go using the QR action in the mobile preview. The client can be explored offline immediately. To pair a laptop, run the Windows agent and use the host, port, and one-time code shown by the agent.

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

The agent prints a one-time six-digit pairing code. Enter the laptop host, port, and code in the Android app. Keep the agent on the LAN; do not port-forward it.

## Checks

```bash
pnpm run typecheck
python -m py_compile windows-agent/agent.py
python -m unittest discover -s tests -p 'test_*.py'
```

See:

- `docs/architecture.md`
- `docs/protocol.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `docs/manual-testing.md`