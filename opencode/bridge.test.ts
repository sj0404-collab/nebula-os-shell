// bun test opencode/bridge.test.ts
// Integration test of the REAL bridge: spawns bridge.ts (which spawns `opencode serve`),
// creates a session, sends a prompt to opencode/big-pickle and waits for the real answer via SSE.
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';

const PORT = 18787;
const OC_PORT = 14096;
const BASE = `http://127.0.0.1:${PORT}`;
let proc: ReturnType<typeof Bun.spawn>;

async function waitFor(url: string, ms: number) {
  const t = Date.now() + ms;
  while (Date.now() < t) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* not yet */ }
    await Bun.sleep(500);
  }
  throw new Error(`timeout waiting for ${url}`);
}

beforeAll(async () => {
  proc = Bun.spawn(['bun', 'run', join(import.meta.dir, 'bridge.ts')], {
    env: { ...process.env, BRIDGE_PORT: String(PORT), OPENCODE_PORT: String(OC_PORT) },
    stdout: 'inherit', stderr: 'inherit',
  });
  const info = await waitFor(`${BASE}/api/opencode/bridge`, 90_000) as { ok: boolean };
  expect(info.ok).toBe(true);
}, 120_000);

afterAll(() => { proc?.kill(); });

test('bridge info reports opencode version, model and workspace', async () => {
  const j = await (await fetch(`${BASE}/api/opencode/bridge`)).json() as { ok: boolean; opencode: string; model: string; workspace: string; bun: string };
  expect(j.ok).toBe(true);
  expect(j.opencode).toMatch(/^\d+\.\d+\.\d+/);
  expect(j.model).toBe(process.env.OPENCODE_MODEL ?? 'opencode/big-pickle');
  expect(j.workspace.length).toBeGreaterThan(0);
  expect(j.bun).toBe(Bun.version);
});

test('proxy reaches opencode: /global/health and /config/providers', async () => {
  const h = await (await fetch(`${BASE}/api/opencode/global/health`)).json() as { healthy: boolean };
  expect(h.healthy).toBe(true);
  const p = await (await fetch(`${BASE}/api/opencode/config/providers`)).json() as { providers: { id: string }[] };
  expect(p.providers.some(x => x.id === 'opencode')).toBe(true);
});

test('real agent answers a prompt through the bridge (SSE)', async () => {
  const s = await (await fetch(`${BASE}/api/opencode/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'bridge test' }) })).json() as { id: string };
  expect(s.id).toMatch(/^ses_/);

  const es = await fetch(`${BASE}/api/opencode/event`, { headers: { accept: 'text/event-stream' } });
  expect(es.headers.get('content-type')).toContain('text/event-stream');
  const reader = es.body!.getReader();

  const r = await fetch(`${BASE}/api/opencode/session/${s.id}/prompt_async`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: { providerID: 'opencode', modelID: 'big-pickle' }, parts: [{ type: 'text', text: 'Reply with exactly the two words: BRIDGE OK' }] }),
  });
  expect([200, 204]).toContain(r.status);

  let text = '';
  let idle = false;
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 90_000;
  while (!idle && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      let e: { type: string; properties: Record<string, unknown> };
      try { e = JSON.parse(line.slice(5)); } catch { continue; }
      const p = e.properties;
      if (e.type === 'message.part.updated') {
        const part = p.part as { sessionID: string; type: string; text?: string };
        if (part.sessionID === s.id && part.type === 'text' && part.text && !part.text.startsWith('Reply with')) text = part.text;
      }
      if (e.type === 'session.idle' && (p as { sessionID: string }).sessionID === s.id) idle = true;
    }
  }
  reader.cancel();
  expect(idle).toBe(true);
  expect(text.toUpperCase()).toContain('BRIDGE OK');
}, 120_000);

test('static fallback responds (dist or hint)', async () => {
  const r = await fetch(`${BASE}/`);
  expect(r.status).toBe(200);
});
