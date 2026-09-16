# Architecture

## Components

### Android client

The Expo Router app in `artifacts/phone-laptop-remote` provides the control-room dashboard, pairing flow, device list, history, and safety settings. `RemoteContext` is the local source of truth and persists state with AsyncStorage. It uses a direct LAN client for `/pair` and authenticated `/command` requests.

The client is intentionally usable before a laptop is paired. Commands entered while offline are saved as local records with an offline result; the UI does not claim that a Windows action occurred.

### Windows agent

`windows-agent/agent.py` is a lightweight `ThreadingHTTPServer` process that can run on Windows without a framework. It exposes:

- `GET /health` for connectivity checks
- `POST /pair` for one-time pairing
- `POST /telemetry` for authenticated system information
- `POST /command` for authenticated allowlisted actions

The agent owns the operating-system boundary. Natural-language text is accepted only as input to a deterministic interpreter that maps it to an allowlisted action. It never evaluates a shell string from the client.

### State and transport

The first build uses direct LAN HTTP(S) instead of a public relay or hosted backend. This keeps commands local and avoids requiring an account or cloud database. TLS is required by default; plaintext is available only through the explicit `--allow-insecure-dev` flag.

## Planned extensions

- Windows tray shell around the agent process
- DNS-SD/mDNS discovery with manual-host fallback
- Secure certificate pinning for the mobile client
- Screen capture and remote input as separately permissioned capabilities
- A shared typed protocol package once the wire format stabilizes