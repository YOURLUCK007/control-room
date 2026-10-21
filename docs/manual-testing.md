# Manual testing checklist

## Mobile client

- [ ] Open the app in Expo Go and confirm the dashboard renders in light and dark system themes.
- [ ] Open Devices, add a laptop with invalid details, and confirm validation appears without a crash.
- [ ] Start the agent with `--allow-insecure-dev`, enter the host, port, and printed code, and confirm the device becomes ONLINE.
- [ ] Confirm Local-only mode accepts private LAN addresses/names and rejects public hosts; with it disabled, reject non-local HTTP and accept only a configured HTTPS endpoint.
- [ ] Confirm the dashboard reports the actual agent connection and refreshes CPU, memory, and uptime while paired.
- [ ] Open Command Prompt and Task Manager with quick actions and confirm each opens on Windows.
- [ ] Submit `Show system status` while paired and confirm the response and telemetry appear.
- [ ] Submit `Show my desktop` and confirm Windows shows the desktop.
- [ ] Stop the agent and submit another command; confirm it is saved locally and not reported as sent.
- [ ] Open Files, switch among Desktop/Documents/Downloads, browse a folder, and open a UTF-8 text file.
- [ ] Edit an existing file, confirm the save, and verify that a timestamped backup remains next to it.
- [ ] Try to browse outside the three allowed folders and confirm the agent rejects the path.
- [ ] Run a read-only PowerShell command in Terminal, cancel a second command at the confirmation prompt, then run a harmless command and verify its output.
- [ ] Confirm PowerShell commands over 1,200 characters are rejected and commands that exceed the time limit return a timeout.
- [ ] In a custom Android development build, grant microphone/speech permissions, dictate a command, and confirm the transcript remains editable before sending.
- [ ] Confirm speech alone never sends a command, sensitive operations still show confirmation, and the phone speaks the final status after a voice-originated command.
- [ ] In Expo Go, confirm keyboard dictation remains available for basic testing; the native mic feature requires the custom development build.
- [ ] Search, repeat, and clear command history.
- [ ] Toggle confirmation, device unlock, and local-only settings.
- [ ] Remove a paired device and confirm it is no longer selected.

## Windows agent

- [ ] Confirm startup refuses plaintext unless `--allow-insecure-dev` is explicit.
- [ ] Confirm pairing code expires and cannot be reused.
- [ ] Confirm five incorrect pairing codes lock out pairing until restart.
- [ ] Confirm `/health` works without exposing the pairing secret.
- [ ] Confirm an authenticated telemetry request returns CPU/memory data when `psutil` is available.
- [ ] Confirm a malformed JSON body returns a 400 response.
- [ ] Confirm a request without a bearer token returns 401.
- [ ] Confirm a reused nonce returns 401.
- [ ] Confirm delete, restart, shutdown, and sleep return `requires_confirmation` until explicitly confirmed.
- [ ] Confirm paths outside Desktop, Documents, and Downloads are rejected.
- [ ] Confirm an unknown application returns a useful not-found message.
- [ ] Confirm `WRITE_FILE` and `RUN_COMMAND` return `requires_confirmation` without explicit confirmation.