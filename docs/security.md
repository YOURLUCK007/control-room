# Security notes

## Boundaries

The phone is not trusted to execute arbitrary operating-system text. The Windows agent is the only component allowed to call Windows APIs, and it receives structured actions rather than shell commands.

## Pairing and sessions

- Pairing is an explicit one-time code printed by the laptop.
- The code expires after ten minutes and is consumed after one successful pairing.
- The agent returns an opaque access token and stores only its SHA-256 digest in memory.
- Authenticated requests need a bearer token, a current Unix timestamp, and a unique nonce.
- Reused nonces and requests outside the 30-second clock window are rejected.

## Destructive actions

Delete, sleep, restart, shutdown, and process-control actions require `confirm: true`. The server also returns a `requires_confirmation` response when a confirmation is missing so a client cannot silently perform the operation.

## Deployment guidance

- Keep the agent on a trusted LAN and do not expose port 8765 to the public internet.
- Use TLS certificates for normal operation.
- Restrict the Windows firewall rule to the private network profile.
- Store agent logs locally and review them before enabling startup-at-login.
- Add token revocation and certificate pinning before adding remote-internet access.