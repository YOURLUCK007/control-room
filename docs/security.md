# Security notes

## Boundaries

The Windows agent is the operating-system boundary. The dashboard's natural-language interpreter only maps to known actions. The dedicated terminal is an explicit exception: it runs a user-confirmed PowerShell command as the logged-in Windows user. Treat terminal access as full access to that Windows account.

## Pairing and sessions

- Pairing is an explicit one-time code printed by the laptop.
- The code expires after ten minutes, allows at most five failed attempts, and is consumed after one successful pairing.
- The agent returns an opaque access token and stores only its SHA-256 digest in memory.
- Authenticated requests need a bearer token, a current Unix timestamp, and a unique nonce.
- Reused nonces and requests outside the 30-second clock window are rejected.

## Destructive actions

Delete, file writes, sleep, restart, shutdown, process-control, and terminal actions require `confirm: true`. The server returns a `requires_confirmation` response when a confirmation is missing. The mobile terminal displays the exact command and asks before sending it.

## File access and terminal

- File browsing, text reads, and edits are restricted to the user's Desktop, Documents, and Downloads folders.
- The phone editor handles UTF-8 text only and caps files at 128 KB. Existing files are copied to a timestamped backup before an atomic save.
- PowerShell runs without a profile, from the user's home folder, with a 20-second timeout and bounded output. Commands can still change or delete anything the logged-in Windows user can access.
- Do not use the terminal with untrusted users or devices. Do not expose the agent's port to the public internet.
- The browser's optional Web Speech API may send audio to the browser's recognition provider. Native Expo Go uses the phone keyboard's dictation; review transcribed text before sending.
- Local-only mode is enabled by default and blocks non-private addresses. Disabling it does not create a secure tunnel; non-local hosts must use HTTPS, and the agent should remain behind a private VPN or LAN firewall.

## Deployment guidance

- Keep the agent on a trusted LAN and do not expose port 8765 to the public internet.
- Use TLS certificates for normal operation.
- Restrict the Windows firewall rule to the private network profile.
- Store agent logs locally and review them before enabling startup-at-login.
- Pair only trusted phones. Tokens are memory-only in the agent and are invalidated on agent restart; the phone must be re-paired.
- The agent cannot power on a fully shut-down laptop. Wake-on-LAN is not implemented.
- Add token revocation and certificate pinning before adding remote-internet access.