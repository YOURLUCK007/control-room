# Troubleshooting

## The phone says the agent is offline

1. Confirm the Windows agent process is still running.
2. Confirm the phone and laptop are on the same Wi-Fi network.
3. Use the laptop's LAN IP rather than its computer name.
4. Check that Windows Firewall permits the agent port on the private network.
5. Open `http://<host>:8765/health` from another device on the same network when using `--allow-insecure-dev`.

## Pairing code rejected

The code is one-time and expires after ten minutes. Restart the agent to print a new code, then pair again.

## TLS connection errors

The certificate must include the hostname used by the phone. For development only, use the explicit `--allow-insecure-dev` flag and use an `http://` host in the client. Do not use that mode outside a trusted LAN.

## A command is refused

The refusal is expected when the action is outside the allowlist, a path is outside Desktop/Documents/Downloads, a target app cannot be discovered, or a destructive command lacks confirmation. The agent returns a human-readable reason rather than running a fallback shell command.

## Android preview does not start

Run:

```bash
CI=1 pnpm exec expo install --check
pnpm dlx expo-doctor@latest
```

Then restart the managed mobile workflow. Do not start Expo with a separate root-level command because the preview workflow supplies the required routing environment.