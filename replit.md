# Laptop Remote

An Android control room that pairs with a Windows laptop over a secure local-network agent.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Product

- Android client: `artifacts/phone-laptop-remote`
- Windows agent: `windows-agent/agent.py`
- Protocol and operations docs: `docs/`
- Agent tests: `tests/test_agent.py`

The first build is local-first. The client persists paired devices, tokens, settings, and command history on the phone. The Windows agent requires TLS by default and only exposes structured allowlisted actions.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Mobile app routes and UI: `artifacts/phone-laptop-remote/app/`
- Local device state and command history: `artifacts/phone-laptop-remote/context/RemoteContext.tsx`
- LAN protocol client: `artifacts/phone-laptop-remote/lib/agentClient.ts`
- Windows security boundary and action handlers: `windows-agent/agent.py`
- Agent protocol and safety tests: `tests/test_agent.py`
- Product and security instructions: `README.md` and `docs/`

## Architecture decisions

- Mobile-to-PC traffic goes directly over the LAN; there is no relay or account backend in this feature.
- Pairing uses a one-time code. Agent token hashes and replay nonces are held in memory, so restarting the agent invalidates existing phone pairings.
- Natural-language commands map only to specific handlers. Arbitrary PowerShell exists only on a separate terminal screen and always needs per-command confirmation.
- The file browser/editor is limited to Desktop, Documents, and Downloads; edits are UTF-8 text up to 128 KB and overwrites keep an adjacent backup.
- Pairing allows five wrong codes before a restart is required. Local-only mode blocks non-LAN hosts; when disabled, a non-local host must use HTTPS.

## Product

Laptop Remote pairs an Android phone to a Windows agent for launching apps/files, opening common folders, reading system status, and performing confirmed power actions. The phone also has a scoped text-file editor and a confirmed PowerShell terminal. Native voice entry uses the phone keyboard dictation; browser voice input is optional and browser-provider controlled.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do not route natural-language text into a shell. Keep `RUN_COMMAND` separate, explicitly confirmed, bounded to 20 seconds, and clearly described as full access to the logged-in Windows account.
- A fully shut-down laptop cannot answer the agent; wake-on-LAN is not implemented.
- Expo Go does not include a native speech-recognition module. Do not add a native speech package without rebuilding the Expo dependency/lockfile and verifying the development build.
- Python tests exercise the agent on this platform; Windows API actions and LAN pairing still require manual testing on an actual Windows laptop and phone.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
