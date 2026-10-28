# opencode bridge — real AI TUI inside Nebula OS (Bun)

`opencode/bridge.ts` is a **real Bun program** that turns the in-browser "opencode — TUI" window
into a client of the real [opencode](https://opencode.ai) agent (v1.19.x) running on the
free `opencode/big-pickle` model (OpenCode Zen, no API key needed).

```
browser  ──/api/opencode/*──▶  bridge.ts (Bun, :8787)  ──▶  opencode serve (:4096)  ──▶  Zen / big-pickle
   ▲  SSE /event                 │ serves dist/ as SPA fallback
   └─────────────────────────────┘
```

## Run

```bash
bun install -g opencode-ai        # once (or: npm i -g opencode-ai)
npm run build                     # dist/ (optional — bridge also serves it)
bun run opencode/bridge.ts        # = npm run opencode
```

* Dev: `npm run dev` — Vite proxies `/api/opencode` to the bridge (also `vite preview`).
* Standalone single binary: `npm run opencode:compile` → `./opencode-bridge`
  (serves `dist/` + API on one port; bridge detection of `/$bunfs` falls back to `cwd`).
* Env: `BRIDGE_PORT=8787 OPENCODE_PORT=4096 OPENCODE_MODEL=opencode/big-pickle OPENCODE_WORKSPACE=<dir> OPENCODE_BIN=<path>`.
* If an `opencode serve` is already running on `OPENCODE_PORT`, the bridge reuses it.

## What the window does

* Probes `GET /api/opencode/bridge` → badge **live · v1.19.5**; falls back to the scripted demo
  (**demo · bridge offline**) when the bridge is not running, so the OS keeps working anywhere.
* Live mode: `POST /session`, `EventSource /event`, `POST /session/:id/prompt_async`
  with `{providerID:'opencode', modelID:'big-pickle'}`; renders streamed text, tool calls
  (bash / read / edit / write …), step tokens, `FILES TOUCHED`, abort, permission auto-grant.
* The agent works in the **repository itself** (`x-opencode-directory`), so it can read/edit
  `game/`, `src/`, run `zig`, `npm test`, etc.

## Test

```bash
npm run test:opencode     # bun test opencode/bridge.test.ts
```

Spawns the bridge on :18787 (opencode on :14096), checks `/bridge`, `/global/health`,
`/config/providers`, creates a session, sends a real prompt and asserts the SSE answer
contains `BRIDGE OK`. Last run: 4 pass / 0 fail, ~6.5 s.

![live](../docs/opencode-live.png)
