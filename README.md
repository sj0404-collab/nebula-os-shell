# Nebula OS Shell — web desktop with a real AI agent TUI

A Windows‑10‑style desktop that runs entirely in the browser (React 19 + Vite + Tailwind):
File Explorer, Command Prompt, Edge, Steam/Epic mock‑ups, the **Nebula Strike** game
(a Zig game compiled to **win64 / wasm32 / wasm64**) and an **opencode AI TUI** window
backed by the real [opencode](https://opencode.ai) agent through a Bun bridge.

![opencode live](docs/opencode-live.png)

## Quick start

```bash
npm ci
npm run dev            # http://localhost:5173  (demo mode for the opencode window)

# real AI agent (free model opencode/big-pickle, no API key):
bun install -g opencode-ai
npm run opencode       # Bun bridge :8787 → opencode serve :4096 (vite proxies /api/opencode)
```

Scripts

| script | what |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server / production build to `dist/` / preview |
| `npm run lint` | ESLint (0 problems) |
| `npm run opencode` | `bun run opencode/bridge.ts` — real agent bridge |
| `npm run opencode:compile` | `bun build --compile` → single `opencode-bridge` binary (serves `dist/` + API) |
| `npm run test:opencode` | `bun test` — end‑to‑end test of the bridge + real model answer |
| `npm run test:e2e` | Playwright desktop e2e (15 scenarios: windows, terminal, game autotest, opencode demo/live, phone viewport) |
| `node e2e/with-bridge.mjs` | starts the real bridge, runs e2e with the LIVE opencode window, stops it |
| `npm test` / `npm run test:all` | lint + typecheck + e2e (+ bridge test) |
| `npm run opencode:compile:all` | binaries for linux‑x64/arm64, macOS arm64/x64, windows‑x64 → `release/` |

## Platforms

| Platform | How |
|---|---|
| **Web** (any modern browser, desktop/mobile) | `npm run dev` / `npm run preview` / the bridge itself serves `dist/` on :8787 |
| **PWA** (installable on Android, iOS, ChromeOS, Windows, macOS) | open the site → "Install app" / "Add to Home screen"; offline shell, `/api` never cached |
| **Android APK** (Capacitor) | CI builds a signed `NebulaOS-vX.Y.Z-android.apk` (Releases). **No PC needed**: the opencode agent runs natively on the phone (see below). A PC bridge is optional (⚙ → mode `bridge`, `http://<pc-ip>:8787`) |
| **Windows / macOS / Linux** | `npm run opencode` or the single‑file `opencode-bridge-*` binary from Releases (serves the desktop + real agent) |

Touch devices get on‑screen controls in Nebula Strike (◀ ▶ FIRE), pointer‑event window dragging and maximized windows under 640 px.

### Native opencode agent (no bridge, no PC)

`src/lib/agent/core.ts` is an in‑app implementation of the opencode agent loop: the same system prompt, tool catalogue
(`bash edit glob grep read write webfetch todowrite task …`), request/session identifiers and SSE protocol as the opencode
CLI 1.19.5, talking to the free **OpenCode Zen** endpoint (`opencode/big-pickle`, `Bearer public`; your own key can be
entered in ⚙). The loop is platform‑agnostic — only the *host* differs:

| Build | Model transport | Tools |
|---|---|---|
| **Android APK** | `NebulaNativePlugin.httpStream` — streaming HTTPS from Java, straight from the phone | real `/system/bin/sh`, real files in `Android/data/com.bigpickle.nebulaos/files/workspace`, `webfetch` |
| **Web / PWA** | bridge pass‑through `/api/opencode/zen/*` (browsers cannot call opencode.ai directly: no CORS, forbidden `User-Agent`) | in‑browser workspace (localStorage), file tools + `webfetch` |
| **CI / Bun** (`opencode/native-agent.test.ts`) | `fetch` | Bun shell + fs |

Mode is chosen in the opencode window (⚙): `auto` (native in the APK, bridge on the web), `native`, `bridge`.

### WebGL renderer
Nebula Strike is drawn by `src/lib/webgl.ts` (WebGL2, WebGL1 fallback, Canvas 2D only if the GPU is unavailable):
procedural nebula background shader, one dynamic VBO for solid geometry, an additive glow pass and a HUD texture.
With the wasm64 core the vertex data is read **directly from the module's 64‑bit linear memory** (`NebulaWasm64.views()`),
no per‑entity JS objects. The badge in the window shows `WASM64 · MEMORY64 · WEBGL2` and the GPU string.

### Android build locally
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleRelease      # android/app/build/outputs/apk/release/app-release.apk
```
(JDK 17+, Android SDK; the demo keystore `android/keystore/nebula-release.jks` is in the repo — override with `NEBULA_KEYSTORE*` env vars for your own key.)

## Cross‑platform

* Runs on **Windows, macOS and Linux**: the bridge finds `opencode` in PATH, `~/.bun/bin`, `node_modules/.bin`,
  `%APPDATA%\npm`, `/opt/homebrew/bin`, wraps `.cmd` shims on Windows and falls back to `bunx opencode-ai`.
* CI (`.github/workflows/ci.yml`) runs lint → typecheck → build → bun bridge test (real model) → native agent loop test (real model) → Playwright e2e
  on **ubuntu‑latest, windows‑latest and macos‑latest**, then builds single‑file bridge executables for all
  platforms; a `v*` tag publishes them (with `dist/`) as a GitHub Release.
* The desktop works with mouse, touch and pen (pointer events), fits phone screens (windows open maximized
  under 640 px, are clamped to the viewport on resize/rotation) and needs only a modern browser.

## Project layout

```
src/                 desktop shell (App, WindowFrame, Taskbar, StartMenu, apps/*)
src/components/apps/OpencodeApp.tsx   real/demo opencode TUI window
src/lib/agent.ts     scripted "Big Pickle" demo used when the bridge is offline
opencode/bridge.ts   Bun bridge (spawns opencode serve, proxies REST + SSE, serves dist/)
opencode/bridge.test.ts  bun test
opencode.json        opencode config (model opencode/big-pickle, permissions)
game/                Nebula Strike sources (Zig) + build/autotest scripts
public/downloads/    built NebulaStrike.exe, wasm32/wasm64, source zip, autotest results
TEST_REPORT.md       test report (Russian): fixes, benchmarks, opencode integration
```

## In‑desktop tips

* Command Prompt: `help`, `dir`, `nebula`, `opencode` (opens the AI TUI).
* opencode window: green badge **live** = real agent working inside this repository
  (it can read/edit files and run commands there); yellow **demo** = bridge not running.
* Nebula Strike: wasm64 needs Chrome ≥ 133 / Node ≥ 22; wasm32 works everywhere.

See [opencode/README.md](opencode/README.md) for the bridge API and environment variables.
