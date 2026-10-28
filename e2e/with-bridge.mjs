#!/usr/bin/env node
// Runs the real opencode bridge in the background, then the e2e suite (LIVE mode included), then stops it.
// Cross-platform (Windows / macOS / Linux). Usage: node e2e/with-bridge.mjs
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = process.env.BRIDGE_PORT ?? '8787';
const bridge = spawn('bun', ['run', 'opencode/bridge.ts'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32', env: { ...process.env, BRIDGE_PORT: PORT } });

const t0 = Date.now();
let up = false;
while (Date.now() - t0 < 150_000) {
  if (bridge.exitCode !== null) break;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/opencode/bridge`); if (r.ok) { up = true; break; } } catch { /* wait */ }
  await new Promise(r => setTimeout(r, 1000));
}
if (!up) { console.error('bridge did not start'); bridge.kill(); process.exit(1); }

const e2e = spawn(process.execPath, ['e2e/run.mjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, E2E_BRIDGE: '1' } });
const code = await new Promise(res => e2e.on('exit', res));
if (process.platform === 'win32') spawn('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { stdio: 'ignore' });
else { try { process.kill(-bridge.pid, 'SIGTERM'); } catch { bridge.kill(); } }
process.exit(code ?? 1);
