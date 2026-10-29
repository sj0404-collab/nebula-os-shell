// Runs the in-app native agent loop (src/lib/agent/core.ts) under Bun against the real free
// OpenCode Zen endpoint, with a real filesystem + shell host — the same code path the Android
// app uses (there the host is the Capacitor plugin). Skipped when the network is unavailable.
import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:os';
import { runAgent, fetchTransport, buildSystemPrompt, toolDefinitions, globToRegExp, parseSseLine, type ToolHost, type AgentEvent } from '../src/lib/agent/core';

function bunHost(cwd: string): ToolHost {
  return {
    cwd, platform: platform() === 'win32' ? 'windows' : platform() === 'darwin' ? 'darwin' : 'linux',
    readFile: async p => readFileSync(p, 'utf8'),
    writeFile: async (p, c) => { writeFileSync(p, c); },
    list: async p => readdirSync(p).map(name => ({ name, dir: statSync(join(p, name)).isDirectory() })),
    exists: async p => existsSync(p),
    exec: async (command, o) => {
      const shell = platform() === 'win32' ? ['cmd.exe', '/d', '/s', '/c', command] : ['sh', '-c', command];
      const proc = Bun.spawn(shell, { cwd: o.cwd, stdout: 'pipe', stderr: 'pipe' });
      const t = setTimeout(() => proc.kill(), o.timeoutMs);
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      clearTimeout(t);
      return { stdout, stderr, code };
    },
    fetchText: async (url, timeoutMs) => { const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }); return { status: r.status, contentType: r.headers.get('content-type') ?? '', body: await r.text() }; },
  };
}

test('prompt + tool catalogue match the opencode CLI shape', () => {
  const sys = buildSystemPrompt({ cwd: '/data/ws', platform: 'android' });
  expect(sys.startsWith('You are opencode, an interactive CLI tool')).toBe(true);
  expect(sys).toContain('Working directory: /data/ws');
  expect(sys).toContain('Platform: android');
  expect(sys).not.toContain('{{');
  expect(toolDefinitions().map(t => t.function.name)).toEqual(['bash', 'edit', 'glob', 'grep', 'read', 'skill', 'task', 'todowrite', 'webfetch', 'websearch', 'write']);
});

test('sse + glob helpers', () => {
  expect(parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}')).toEqual({ content: 'hi' });
  expect(parseSseLine('data: [DONE]')).toBeNull();
  expect(globToRegExp('**/*.{c,h}').test('game/nebula.c')).toBe(true);
  expect(globToRegExp('*.ts').test('a/b.ts')).toBe(false);
});

test('native loop: real zen model runs bash + write tools on the device', async () => {
  const ws = mkdtempSync(join(tmpdir(), 'nebula-native-'));
  writeFileSync(join(ws, 'README.md'), '# demo workspace\n');
  const events: AgentEvent[] = [];
  const history = await runAgent(
    'Use the bash tool to run `ls` in the workspace, then use the write tool to create a file named hello.txt containing exactly "native ok". Finally reply with one short sentence.',
    { host: bunHost(ws), transport: fetchTransport, maxSteps: 8, onEvent: e => events.push(e) },
  );
  const err = events.find(e => e.type === 'error');
  if (err && /429|FreeUsageLimit|HTTP 0/.test(err.message)) { console.warn('zen unavailable:', err.message); return; }
  expect(err).toBeUndefined();
  const tools = events.filter(e => e.type === 'part' && e.part.type === 'tool' && e.part.state?.status === 'completed').map(e => (e as Extract<AgentEvent, { type: 'part' }>).part.tool);
  expect(tools.length).toBeGreaterThan(0);
  expect(tools).toContain('bash');
  // the model may create the file with the write tool or via the shell — either way it must exist on disk
  expect(existsSync(join(ws, 'hello.txt'))).toBe(true);
  expect(readFileSync(join(ws, 'hello.txt'), 'utf8').replace(/["']/g, '').trim()).toBe('native ok');
  expect(history.at(-1)?.role).toBe('assistant');
  expect((history.at(-1)?.content ?? '').length).toBeGreaterThan(0);
}, 120_000);
