# Manual testing checklist

## Mobile client

- [ ] Open the app in Expo Go and confirm the dashboard renders in light and dark system themes.
- [ ] Open Devices, add a laptop with invalid details, and confirm validation appears without a crash.
- [ ] Start the agent with `--allow-insecure-dev`, enter the host, port, and printed code, and confirm the device becomes ONLINE.
- [ ] Submit `Show system status` while paired and confirm a sent command is recorded.
- [ ] Stop the agent and submit another command; confirm it is clearly saved as offline rather than reported as successful.
- [ ] Search, repeat, and clear command history.
- [ ] Toggle confirmation, device unlock, and local-only settings.
- [ ] Remove a paired device and confirm it is no longer selected.

## Windows agent

- [ ] Confirm startup refuses plaintext unless `--allow-insecure-dev` is explicit.
- [ ] Confirm pairing code expires and cannot be reused.
- [ ] Confirm `/health` works without exposing the pairing secret.
- [ ] Confirm an authenticated telemetry request returns CPU/memory data when `psutil` is available.
- [ ] Confirm a malformed JSON body returns a 400 response.
- [ ] Confirm a request without a bearer token returns 401.
- [ ] Confirm a reused nonce returns 401.
- [ ] Confirm delete, restart, shutdown, and sleep return `requires_confirmation` until explicitly confirmed.
- [ ] Confirm paths outside Desktop, Documents, and Downloads are rejected.
- [ ] Confirm an unknown application returns a useful not-found message.