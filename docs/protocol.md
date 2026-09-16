# Laptop Remote protocol

The mobile app talks directly to the Windows agent over the local network. The reference agent listens on port `8765`.

## Pairing

1. The agent prints a six-digit code on startup. The code is valid for ten minutes and one successful pairing.
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

The token is used only for this paired phone. Revoke the token by removing the device from the agent data directory or add a device-revocation UI before exposing the agent beyond a trusted LAN.

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

The agent supports a fixed allowlist. It never executes a shell string received from the phone. `NATURAL_LANGUAGE` is accepted as a convenience action and maps only to deterministic allowlisted handlers.

Potentially disruptive actions return `requires_confirmation: true` unless `confirm` is explicitly true. The client must show a confirmation screen and resend the same intent with confirmation rather than silently confirming.

## Read-only endpoints

- `GET /health` returns a minimal connectivity check.
- `GET /pairing` returns the computer name and pairing expiry metadata, but never the secret code.
- `POST /telemetry` returns CPU, memory, uptime, battery, and host information when Windows exposes it.