# Troubleshooting

## The phone says the agent is offline

1. Confirm the Windows agent process is still running and its window still shows the pairing code.
2. Confirm the phone and laptop are on the same Wi-Fi network, and that the Wi-Fi is not a guest network that isolates clients.
3. Use the LAN address the agent prints on startup rather than the computer name; Android often cannot resolve bare Windows hostnames.
4. Allow Python through Windows Firewall for private networks. On PowerShell, as administrator:

```powershell
New-NetFirewallRule -DisplayName "Laptop Remote agent" -Direction Inbound -Protocol TCP -LocalPort 8765 -Profile Private -Action Allow
```

5. Open `http://<host>:8765/health` from another device on the same network when using `--allow-insecure-dev`.
6. Some phones drop plain HTTP on cellular; turn Wi-Fi on and disable private DNS or a VPN that routes LAN traffic.

## Pairing code rejected

The code is one-time and expires after ten minutes. Restart the agent to print a new code, then pair again.

## TLS connection errors

The certificate must include the address used by the phone, and the phone must trust the issuing CA. A self-signed certificate fails with "The agent's TLS certificate is not trusted by this phone"; install the certificate on the device, or run the agent with `--allow-insecure-dev` on a trusted LAN and pair with its `http://` address. Do not use insecure mode outside a trusted LAN.

## Android blocked plaintext HTTP

Release builds refuse `http://` unless cleartext is allowed at build time. This project sets `android.usesCleartextTraffic` through the `expo-build-properties` plugin, so rebuild the native app after changing that value. Expo Go already allows cleartext, so this only affects standalone builds.

## A command is refused

The refusal is expected when the action is outside the allowlist, a path is outside Desktop/Documents/Downloads, a target app cannot be discovered, or a destructive command lacks confirmation. The agent returns a human-readable reason rather than running a fallback shell command.

## Android preview does not start

Run:

```bash
CI=1 pnpm exec expo install --check
pnpm dlx expo-doctor@latest
```

Then restart the managed mobile workflow. Do not start Expo with a separate root-level command because the preview workflow supplies the required routing environment.