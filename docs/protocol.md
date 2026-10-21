# Laptop Remote protocol

The mobile app talks directly to the Windows agent over the local network. The reference agent listens on port `8765`.

## Pairing

1. The agent prints a six-digit code on startup. The code is valid for ten minutes, allows at most five failed attempts, and one successful pairing.
2. The phone sends `POST /pair`:

```json
{ "code": "123456" }
```

3. The agent returns a short-lived pairing result containing an access token:

```json
{
  "success": true,
  "access_token": "opaque-token",
  "computer": { "id": "HOST", "name": "HOST", "os": "Windows 11" }
}
```

The phone stores the token locally; the agent stores only its digest in memory. Restarting the agent revokes all active tokens. Removing a paired device only deletes the phone's saved token; it does not revoke the digest at the agent. Add per-device revocation before exposing the agent beyond a trusted LAN.

## Authenticated requests

`POST /telemetry` and `POST /command` require:

- `Authorization: Bearer <access_token>`
- `X-Laptop-Remote-Timestamp: <unix seconds>`
- `X-Laptop-Remote-Nonce: <unique random value>`

The agent rejects timestamps outside a 30-second window and rejects reused nonces.

## Commands

```json
{
  "request_id": "client-generated-id",
  "action": "OPEN_APPLICATION",
  "parameters": { "name": "Visual Studio Code" },
  "confirm": false
}
```

`NATURAL_LANGUAGE` maps only to deterministic supported handlers. `LIST_FILES`, `READ_FILE`, and `WRITE_FILE` provide scoped file browsing and text editing inside Desktop, Documents, and Downloads. Reads and writes are limited to UTF-8 text files no larger than 128 KB. Writes require `confirm: true`; overwriting a file creates an adjacent timestamped backup.

`RUN_COMMAND` is a separate, deliberately powerful action. It runs the provided PowerShell command as the logged-in Windows user, requires `confirm: true`, accepts at most 1,200 characters, waits up to 20 seconds, and returns bounded stdout/stderr. It is not available through natural-language command parsing. Keep the agent on a trusted LAN and never port-forward it.

Potentially disruptive actions return `requires_confirmation: true` unless `confirm` is explicitly true. The client must show the exact operation for confirmation rather than silently confirming it.

## Read-only endpoints

- `GET /health` returns a minimal connectivity check.
- `GET /pairing` returns the computer name and pairing expiry metadata, but never the secret code.
- `POST /telemetry` returns CPU, memory, uptime, battery, and host information when Windows exposes it.