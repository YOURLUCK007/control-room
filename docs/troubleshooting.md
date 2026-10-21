# Troubleshooting

## The phone says the agent is offline

This is the Windows agent connection, not the Expo preview connection. Restarting Expo will not start the Windows agent.

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

## Expo Go says it cannot connect to Expo CLI

This warning means the Metro live-update (HMR) connection dropped. It is separate from the Windows agent connection; the warning alone does not mean the app bundle failed to load, but live code updates may stop.

1. Stop and restart the managed mobile workflow in Replit.
2. Close and reopen Expo Go, then scan the new QR code.
3. If the network still blocks the live connection, stop the managed workflow and start Expo's tunnel mode from the workspace root:

   ```bash
   pnpm --filter @workspace/phone-laptop-remote run dev:tunnel
   ```

   Scan the fresh QR code printed by Expo. This uses Expo's tunnel instead of Replit's managed preview route; do not run it at the same time as the managed workflow.

## Android preview does not start

Run:

```bash
CI=1 pnpm exec expo install --check
pnpm dlx expo-doctor@latest
```

Then restart the managed mobile workflow. Do not start Expo with a separate root-level command because the preview workflow supplies the required routing environment.