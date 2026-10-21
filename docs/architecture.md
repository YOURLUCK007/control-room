# Architecture

## Components

### Mobile client

The Expo Router app in `artifacts/phone-laptop-remote` provides the control-room dashboard, pairing flow, device list, history, safety settings, a scoped file browser/editor, and a confirmed remote PowerShell terminal. `RemoteContext` is the local source of truth and persists paired devices, tokens, settings, and command history with AsyncStorage. It uses a direct LAN client for `/pair` and authenticated `/command` requests. Press-to-talk speech recognition populates the command field for review; `expo-speech` reads back the response after a voice-originated command. Native recognition requires a custom development build, while Expo Go can use keyboard dictation.

The client is intentionally usable before a laptop is paired. Commands entered while offline are saved as local records with an offline result; the UI does not claim that a Windows action occurred.

### Windows agent

`windows-agent/agent.py` is a lightweight `ThreadingHTTPServer` process that can run on Windows without a framework. It exposes:

- `GET /health` for connectivity checks
- `POST /pair` for one-time pairing
- `POST /telemetry` for authenticated system information
- `POST /command` for authenticated allowlisted actions

The agent owns the operating-system boundary. Natural-language text is accepted only as input to a deterministic interpreter that maps it to supported actions. File operations are restricted to Desktop, Documents, and Downloads; phone-side text edits need explicit confirmation and preserve an adjacent backup. A separate `RUN_COMMAND` protocol action accepts a PowerShell command only after explicit confirmation, bounds command size, execution wait, and output, and runs as the logged-in Windows user.

### State and transport

The first build uses direct LAN HTTP(S) instead of a public relay or hosted backend. This keeps commands local and avoids requiring an account or cloud database. TLS is required by default; plaintext is available only through the explicit `--allow-insecure-dev` flag.

## Planned extensions

- Windows tray shell around the agent process
- DNS-SD/mDNS discovery with manual-host fallback
- Secure certificate pinning for the mobile client
- Screen capture and remote input as separately permissioned capabilities
- Wake-on-LAN support for devices configured to wake while powered off
- A shared typed protocol package once the wire format stabilizes