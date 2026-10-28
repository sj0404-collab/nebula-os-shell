#!/usr/bin/env bun
/**
 * opencode bridge — real Bun file.
 *
 * Starts the REAL `opencode serve` (https://opencode.ai, headless HTTP API) inside this repository
 * and exposes it to the browser OS shell:
 *
 *   /api/opencode/bridge   → bridge info (version, model, workspace)
 *   /api/opencode/*        → transparent proxy to the opencode server (sessions, prompt_async, SSE /event …)
 *   /*                     → static files from ./dist (when `vite build` was run), SPA fallback to index.html
 *
 * Usage:
 *   bun run opencode/bridge.ts                 # http://localhost:8787  (serves dist/ + API)
 *   npm run dev  /  npm run preview            # Vite proxies /api/opencode → :8787
 *
 * Env:
 *   BRIDGE_PORT=8787  OPENCODE_PORT=4096  OPENCODE_MODEL=opencode/big-pickle  OPENCODE_WORKSPACE=<dir>
 *   OPENCODE_BIN=/path/to/opencode  (default: `opencode` in PATH, then ~/.bun/bin/opencode, then `bunx opencode-ai`)
 *
 * Single-file executable:  bun build --compile opencode/bridge.ts --outfile opencode-bridge
 */
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, extname } from 'node:path';

const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const OC_PORT = Number(process.env.OPENCODE_PORT ?? 4096);
const MODEL = process.env.OPENCODE_MODEL ?? 'opencode/big-pickle';
// When compiled with `bun build --compile` import.meta.dir points into the virtual /$bunfs,
// so fall back to the directory the binary is launched from.
const ROOT = import.meta.dir.startsWith('/$bunfs') || /^[A-Za-z]:\\~BUN/.test(import.meta.dir)
  ? process.cwd()
  : resolve(import.meta.dir, '..');
const WORKSPACE = resolve(process.env.OPENCODE_WORKSPACE ?? ROOT);
const DIST = join(ROOT, 'dist');
const OC_URL = `http://127.0.0.1:${OC_PORT}`;
const API_PREFIX = '/api/opencode';

function findOpencode(): string[] {
  if (process.env.OPENCODE_BIN) return [process.env.OPENCODE_BIN];
  const inPath = Bun.which('opencode');
  if (inPath) return [inPath];
  const bunBin = join(homedir(), '.bun', 'bin', 'opencode');
  if (existsSync(bunBin)) return [bunBin];
  const npmBin = join(ROOT, 'node_modules', '.bin', 'opencode');
  if (existsSync(npmBin)) return [npmBin];
  return ['bunx', 'opencode-ai@latest'];
}

async function health(): Promise<{ ok: boolean; version?: string }> {
  try {
    const r = await fetch(`${OC_URL}/global/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { ok: false };
    const j = (await r.json()) as { healthy?: boolean; version?: string };
    return { ok: j.healthy !== false, version: j.version };
  } catch {
    return { ok: false };
  }
}

let child: ReturnType<typeof Bun.spawn> | null = null;
let ocVersion = 'unknown';

async function ensureOpencode(): Promise<void> {
  const h = await health();
  if (h.ok) { ocVersion = h.version ?? ocVersion; console.log(`[bridge] reusing opencode server at ${OC_URL} (v${ocVersion})`); return; }
  const cmd = findOpencode();
  console.log(`[bridge] starting: ${cmd.join(' ')} serve --port ${OC_PORT} --hostname 127.0.0.1  (cwd ${WORKSPACE})`);
  child = Bun.spawn([...cmd, 'serve', '--port', String(OC_PORT), '--hostname', '127.0.0.1'], {
    cwd: WORKSPACE,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD ?? '' },
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await Bun.sleep(500);
    const hh = await health();
    if (hh.ok) { ocVersion = hh.version ?? ocVersion; console.log(`[bridge] opencode v${ocVersion} ready at ${OC_URL}`); return; }
    if (child.exitCode !== null) throw new Error(`opencode exited with code ${child.exitCode}`);
  }
  throw new Error('opencode serve did not become healthy within 60 s');
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,accept,x-opencode-directory',
};

async function proxy(req: Request, url: URL): Promise<Response> {
  const target = new URL(OC_URL + url.pathname.slice(API_PREFIX.length) + url.search);
  const headers = new Headers();
  for (const h of ['content-type', 'accept', 'last-event-id']) { const v = req.headers.get(h); if (v) headers.set(h, v); }
  headers.set('x-opencode-directory', WORKSPACE);
  const init: RequestInit = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();
  let up: Response;
  try {
    up = await fetch(target, init);
  } catch (e) {
    return Response.json({ error: 'opencode server unreachable', detail: String(e) }, { status: 502, headers: CORS });
  }
  const out = new Headers(CORS);
  for (const h of ['content-type', 'cache-control', 'content-disposition']) { const v = up.headers.get(h); if (v) out.set(h, v); }
  if (up.headers.get('content-type')?.includes('text/event-stream')) { out.set('cache-control', 'no-cache'); out.set('x-accel-buffering', 'no'); }
  return new Response(up.body, { status: up.status, headers: out });
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.exe': 'application/octet-stream', '.zip': 'application/zip', '.pdb': 'application/octet-stream',
};

function serveStatic(pathname: string): Response {
  if (!existsSync(DIST)) {
    return new Response(`opencode bridge is running.\nAPI: ${API_PREFIX}/*  →  ${OC_URL}\nNo ./dist found — run \`npm run build\` to serve the OS shell from here, or use \`npm run dev\`.\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  let file = join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  return new Response(Bun.file(file), { headers: { 'content-type': type, 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' } });
}

await ensureOpencode();

const server = Bun.serve({
  port: BRIDGE_PORT,
  hostname: '0.0.0.0',
  idleTimeout: 255, // SSE /event stays open; Bun's max
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === `${API_PREFIX}/bridge`) {
      const h = await health();
      return Response.json({ ok: h.ok, opencode: h.version ?? ocVersion, model: MODEL, workspace: WORKSPACE, server: OC_URL, bun: Bun.version }, { headers: CORS });
    }
    if (url.pathname.startsWith(API_PREFIX + '/')) return proxy(req, url);
    return serveStatic(url.pathname);
  },
});

console.log(`[bridge] Bun ${Bun.version} · listening on http://localhost:${server.port}  (model ${MODEL}, workspace ${WORKSPACE})`);

const shutdown = () => { console.log('\n[bridge] shutting down'); try { child?.kill(); } catch { /* ignore */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
