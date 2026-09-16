# Laptop Remote Windows Agent

This is the companion process for the Laptop Remote Android app. It runs on a Windows laptop, binds to the local network, and exposes a small authenticated HTTP protocol for pairing, health, telemetry, and allowlisted actions.

## Security model

- The agent refuses to start without TLS unless `--allow-insecure-dev` is explicitly passed.
- Pairing uses a one-time code printed by the agent. The code is invalidated after one successful pairing or after ten minutes.
- Commands require a bearer token returned by pairing.
- Every command request must include a current timestamp and a unique nonce. Replayed requests are rejected.
- The agent never accepts arbitrary shell text. Actions are validated against the handlers in `agent.py`.
- Destructive actions require `confirm: true`.
- The default mode is LAN-only. Do not port-forward this service.

## Run on Windows

1. Install Python 3.11 or newer.
2. From this folder, install the one optional runtime dependency:

```powershell
py -m pip install -r requirements.txt
```

3. Start the agent in explicit local-development mode:

```powershell
py agent.py --allow-insecure-dev
```

The terminal prints the one-time pairing code and the LAN address. Enter that address and code in the Android app.

For a real encrypted LAN session, provide a certificate and private key:

```powershell
py agent.py --host 0.0.0.0 --cert .\certs\agent.crt --key .\certs\agent.key
```

Use a certificate whose subject/SAN matches the laptop hostname or a trusted local certificate authority. The Android client stores the access token locally after pairing.

## Protocol

See `../docs/protocol.md` for request and response shapes.

## Windows limitations

Some actions depend on Windows APIs or installed applications. Unsupported operations return a human-readable `unsupported` error; the agent does not claim success.