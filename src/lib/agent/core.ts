/**
 * Native opencode agent — runs the opencode tool loop on the device itself (no PC bridge).
 *
 * It speaks the same protocol as the opencode CLI to the free OpenCode Zen endpoint
 * (OpenAI-compatible `/chat/completions`, `Authorization: Bearer public`, the opencode system
 * prompt and tool catalogue, SSE streaming). The free tier only answers requests that look like
 * a real opencode client — plain "hello" payloads get `FreeUsageLimitError` — so the prompt and
 * tool definitions are kept byte-compatible with opencode 1.19.5 (see opencode-system.txt / opencode-tools.json).
 *
 * The loop is platform-agnostic: a `Transport` streams the HTTP response (fetch on web/Bun,
 * the Capacitor plugin on Android) and a `ToolHost` executes tools (real shell + files on
 * Android, Bun on CI, an in-browser VFS on the web).
 */
import systemTemplate from './opencode-system';
import toolCatalogue from './opencode-tools.json';

export const ZEN_URL = 'https://opencode.ai/inference/openai/v1/chat/completions';
export const OPENCODE_VERSION = '1.19.5';
export const OPENCODE_UA = `opencode/${OPENCODE_VERSION} ai-sdk/provider-utils/4.0.23 runtime/bun/1.4.4`;
export const DEFAULT_MODEL = 'big-pickle';

// ---------- public types ----------
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }

export interface ToolHost {
  /** absolute workspace directory shown to the model */
  cwd: string;
  platform: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  /** entries of a directory: name + kind */
  list(path: string): Promise<{ name: string; dir: boolean }[]>;
  exists(path: string): Promise<boolean>;
  /** run a shell command; hosts without a shell may reject */
  exec?(command: string, opts: { cwd: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string; code: number }>;
  fetchText?(url: string, timeoutMs: number): Promise<{ status: number; contentType: string; body: string }>;
}

export interface StreamChunk { content?: string; reasoning?: string; toolCalls?: { index: number; id?: string; name?: string; args?: string }[]; finish?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
/** Streams an OpenAI-compatible chat completion; resolves with the final HTTP status. */
export type Transport = (req: { url: string; headers: Record<string, string>; body: string; signal?: AbortSignal }, onLine: (line: string) => void) => Promise<{ status: number; error?: string }>;

export type AgentEvent =
  | { type: 'message'; id: string; role: 'user' | 'assistant' }
  | { type: 'part'; messageID: string; part: AgentPart }
  | { type: 'status'; busy: boolean }
  | { type: 'error'; message: string };
export interface AgentPart {
  id: string; type: 'text' | 'reasoning' | 'tool' | 'step-finish';
  text?: string; tool?: string; callID?: string;
  state?: { status: 'pending' | 'running' | 'completed' | 'error'; title?: string; input?: Record<string, unknown>; output?: string; error?: string };
  reason?: string; tokens?: { total?: number; input?: number; output?: number; reasoning?: number };
}

export interface AgentOptions {
  host: ToolHost;
  transport: Transport;
  model?: string;
  /** opencode zen key (optional) — `public` selects the free tier */
  apiKey?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent: (e: AgentEvent) => void;
  /** persistent todo list shared across turns */
  todos?: { content: string; status: string; priority?: string }[];
  /** history from previous turns (user/assistant/tool messages, without the system prompt) */
  history?: ChatMessage[];
}

// ---------- ids / prompt ----------
// opencode identifiers: 12 hex chars of (timestamp*4096+counter), sessions descending (bitwise NOT), + 14 base62 chars
const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
let idLast = 0, idCounter = 0;
export function opencodeId(prefix: string, descending: boolean): string {
  const ts = Date.now();
  if (ts !== idLast) { idLast = ts; idCounter = 0; }
  idCounter++;
  const current = BigInt(ts) * 0x1000n + BigInt(idCounter);
  const value = descending ? ~current : current;
  const time = Array.from({ length: 6 }, (_, i) => Number((value >> BigInt(40 - 8 * i)) & 0xffn).toString(16).padStart(2, '0')).join('');
  const bytes = new Uint8Array(14);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < 14; i++) bytes[i] = Math.floor(Math.random() * 256);
  return prefix + '_' + time + Array.from(bytes, b => ID_CHARS[b % 62]).join('');
}
const rnd = (n: number) => Array.from({ length: n }, () => ID_CHARS[Math.floor(Math.random() * 62)]).join('');
export const newSessionId = () => opencodeId('ses', true);
export const newRequestId = () => opencodeId('msg', false);

export function buildSystemPrompt(host: Pick<ToolHost, 'cwd' | 'platform'>, model = DEFAULT_MODEL): string {
  return systemTemplate
    .replaceAll('{{cwd}}', host.cwd)
    .replaceAll('{{platform}}', host.platform)
    .replaceAll('{{model}}', model)
    .replaceAll('{{date}}', new Date().toDateString());
}
export const toolDefinitions = () => toolCatalogue as unknown as { type: 'function'; function: { name: string; description: string; parameters: unknown } }[];

export function zenHeaders(sessionID: string, apiKey = 'public'): Record<string, string> {
  return {
    'authorization': `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'user-agent': OPENCODE_UA,
    'x-opencode-client': 'cli',
    'x-opencode-project': 'global',
    'x-opencode-request': newRequestId(),
    'x-opencode-session': sessionID,
    'x-opencode-session-id': sessionID,
  };
}

// ---------- SSE parsing ----------
export function parseSseLine(line: string): StreamChunk | null {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  let j: { choices?: { delta?: { content?: string; reasoning_content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; usage?: StreamChunk['usage']; error?: { message?: string } };
  try { j = JSON.parse(data); } catch { return null; }
  if (j.error) return { content: '', finish: 'error:' + (j.error.message ?? 'unknown') };
  const ch = j.choices?.[0];
  const out: StreamChunk = {};
  if (ch?.delta?.content) out.content = ch.delta.content;
  if (ch?.delta?.reasoning_content) out.reasoning = ch.delta.reasoning_content;
  if (ch?.delta?.tool_calls?.length) out.toolCalls = ch.delta.tool_calls.map(t => ({ index: t.index, id: t.id, name: t.function?.name, args: t.function?.arguments }));
  if (ch?.finish_reason) out.finish = ch.finish_reason;
  if (j.usage) out.usage = j.usage;
  return out;
}

// ---------- the loop ----------
export async function runAgent(prompt: string, o: AgentOptions): Promise<ChatMessage[]> {
  const model = o.model ?? DEFAULT_MODEL;
  const sessionID = newSessionId();
  const history: ChatMessage[] = o.history ? o.history.slice() : [];
  const todos = o.todos ?? [];
  const emit = o.onEvent;
  const userID = opencodeId('msg', false);
  emit({ type: 'message', id: userID, role: 'user' });
  emit({ type: 'part', messageID: userID, part: { id: `${userID}_t`, type: 'text', text: prompt } });
  history.push({ role: 'user', content: prompt });
  emit({ type: 'status', busy: true });

  const maxSteps = o.maxSteps ?? 24;
  try {
    for (let step = 0; step < maxSteps; step++) {
      if (o.signal?.aborted) break;
      const msgID = opencodeId('msg', false);
      emit({ type: 'message', id: msgID, role: 'assistant' });
      const body = JSON.stringify({
        model,
        max_tokens: 32000,
        messages: [{ role: 'system', content: buildSystemPrompt(o.host, model) }, ...history],
        tools: toolDefinitions(),
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      });

      let text = '', reasoning = '';
      const calls = new Map<number, { id: string; name: string; args: string }>();
      let finish = '', usage: StreamChunk['usage'] | undefined;
      const textPart: AgentPart = { id: `${msgID}_text`, type: 'text', text: '' };
      const reasonPart: AgentPart = { id: `${msgID}_reason`, type: 'reasoning', text: '' };
      let lastFlush = 0;
      const flushText = (force = false) => {
        const now = Date.now();
        if (!force && now - lastFlush < 60) return;
        lastFlush = now;
        if (reasoning) emit({ type: 'part', messageID: msgID, part: { ...reasonPart, text: reasoning } });
        if (text) emit({ type: 'part', messageID: msgID, part: { ...textPart, text } });
      };

      const res = await o.transport({ url: ZEN_URL, headers: zenHeaders(sessionID, o.apiKey), body, signal: o.signal }, line => {
        const c = parseSseLine(line);
        if (!c) return;
        if (c.content) text += c.content;
        if (c.reasoning) reasoning += c.reasoning;
        if (c.toolCalls) for (const t of c.toolCalls) {
          const cur = calls.get(t.index) ?? { id: '', name: '', args: '' };
          if (t.id) cur.id = t.id; if (t.name) cur.name += t.name; if (t.args) cur.args += t.args;
          calls.set(t.index, cur);
        }
        if (c.finish) finish = c.finish;
        if (c.usage) usage = c.usage;
        flushText();
      });
      flushText(true);
      if (res.status !== 200) {
        const msg = res.status === 429
          ? 'OpenCode Zen free tier refused the request (FreeUsageLimitError). Add your own OpenCode Zen key in ⚙ or try later.'
          : `model request failed: HTTP ${res.status} ${res.error ?? ''}`.trim();
        emit({ type: 'error', message: msg });
        break;
      }
      if (finish.startsWith('error:')) { emit({ type: 'error', message: finish.slice(6) }); break; }

      const toolCalls: ToolCall[] = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => ({ id: c.id || `call_${rnd(8)}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
      const assistant: ChatMessage = { role: 'assistant', content: text || (toolCalls.length ? null : '') };
      if (reasoning) assistant.reasoning_content = reasoning;
      if (toolCalls.length) assistant.tool_calls = toolCalls;
      history.push(assistant);
      emit({ type: 'part', messageID: msgID, part: { id: `${msgID}_fin`, type: 'step-finish', reason: toolCalls.length ? 'tool-calls' : (finish || 'stop'), tokens: usage ? { total: usage.total_tokens, input: usage.prompt_tokens, output: usage.completion_tokens } : undefined } });

      if (!toolCalls.length) break;

      for (const call of toolCalls) {
        if (o.signal?.aborted) break;
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(call.function.arguments || '{}'); } catch { input = { _raw: call.function.arguments }; }
        const part: AgentPart = { id: `${msgID}_${call.id}`, type: 'tool', tool: call.function.name, callID: call.id, state: { status: 'running', input, title: toolTitle(call.function.name, input) } };
        emit({ type: 'part', messageID: msgID, part });
        let output: string;
        try {
          output = await executeTool(call.function.name, input, o.host, todos, o);
          emit({ type: 'part', messageID: msgID, part: { ...part, state: { ...part.state!, status: 'completed', output } } });
        } catch (e) {
          output = `Error: ${e instanceof Error ? e.message : String(e)}`;
          emit({ type: 'part', messageID: msgID, part: { ...part, state: { ...part.state!, status: 'error', error: output, output } } });
        }
        history.push({ role: 'tool', tool_call_id: call.id, content: output.slice(0, 60_000) });
      }
    }
  } finally {
    emit({ type: 'status', busy: false });
  }
  return history;
}

// ---------- tools ----------
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function toolTitle(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'bash': return str(input.command).slice(0, 120);
    case 'read': case 'write': case 'edit': return str(input.filePath);
    case 'glob': case 'grep': return str(input.pattern);
    case 'webfetch': return str(input.url);
    case 'task': return str(input.description);
    default: return '';
  }
}

export function resolvePath(host: ToolHost, p: string): string {
  if (!p) return host.cwd;
  const win = /^[a-zA-Z]:[\\/]/.test(p) || /^[a-zA-Z]:[\\/]/.test(host.cwd) || p.startsWith('\\\\');
  if (win) {
    const abs = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') ? p : `${host.cwd}\\${p}`;
    const m = abs.match(/^([a-zA-Z]:|\\\\[^\\/]+\\[^\\/]+)?(.*)$/)!;
    const root = m[1] ?? '', rest = m[2];
    const parts: string[] = [];
    for (const seg of rest.split(/[\\/]/)) { if (!seg || seg === '.') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
    return root + '\\' + parts.join('\\');
  }
  if (p.startsWith('/')) return normalize(p);
  return normalize(`${host.cwd}/${p}`);
}
function normalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return '/' + parts.join('/');
}
/** join a directory and an entry name with the directory's own separator style */
function joinPath(dir: string, name: string): string {
  if (/^[a-zA-Z]:/.test(dir) || dir.includes('\\')) return dir.replace(/[\\/]+$/, '') + '\\' + name;
  return `${dir === '/' ? '' : dir}/${name}`;
}

/** glob matcher supporting **, *, ?, {a,b} */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '(?:.*)'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { const j = glob.indexOf('}', i); if (j > 0) { re += '(?:' + glob.slice(i + 1, j).split(',').map(s => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')'; i = j; } else re += '\\{'; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

async function walk(host: ToolHost, dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 12 || out.length > 5000) return;
  let entries: { name: string; dir: boolean }[] = [];
  try { entries = await host.list(dir); } catch { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = joinPath(dir, e.name);
    if (e.dir) await walk(host, full, out, depth + 1); else out.push(full);
  }
}

export async function executeTool(name: string, input: Record<string, unknown>, host: ToolHost, todos: { content: string; status: string; priority?: string }[], o: AgentOptions): Promise<string> {
  switch (name) {
    case 'read': {
      const fp = resolvePath(host, str(input.filePath));
      const content = await host.readFile(fp);
      const lines = content.split('\n');
      const offset = Math.max(0, num(input.offset, 0)), limit = num(input.limit, 2000);
      const slice = lines.slice(offset, offset + limit);
      const body = slice.map((l, i) => `${String(offset + i + 1).padStart(5, '0')}| ${l}`).join('\n');
      return `<file>\n${body}\n${offset + limit < lines.length ? `\n(File has more lines. Use 'offset' parameter to read beyond line ${offset + limit})` : `\n(End of file - total ${lines.length} lines)`}\n</file>`;
    }
    case 'write': {
      const fp = resolvePath(host, str(input.filePath));
      await host.writeFile(fp, str(input.content));
      return `Wrote ${fp}`;
    }
    case 'edit': {
      const fp = resolvePath(host, str(input.filePath));
      const oldS = str(input.oldString), newS = str(input.newString);
      const cur = await host.readFile(fp);
      if (!oldS) { await host.writeFile(fp, newS); return `Wrote ${fp}`; }
      if (!cur.includes(oldS)) throw new Error('oldString not found in content');
      if (!input.replaceAll && cur.indexOf(oldS) !== cur.lastIndexOf(oldS)) throw new Error('oldString found multiple times; provide more context or set replaceAll');
      await host.writeFile(fp, input.replaceAll ? cur.split(oldS).join(newS) : cur.replace(oldS, () => newS));
      return `Edited ${fp}`;
    }
    case 'glob': {
      const root = resolvePath(host, str(input.path));
      const files: string[] = [];
      await walk(host, root, files);
      const re = globToRegExp(str(input.pattern, '**/*'));
      const rel = files.filter(f => { const n = f.replace(/\\/g, '/'), r0 = root.replace(/\\/g, '/'); const r = n.startsWith(r0 + '/') ? n.slice(r0.length + 1) : n; return re.test(r) || re.test(n); });
      return rel.length ? rel.slice(0, 100).join('\n') + (rel.length > 100 ? '\n(Results are truncated)' : '') : 'No files found';
    }
    case 'grep': {
      const root = resolvePath(host, str(input.path));
      const re = new RegExp(str(input.pattern), 'i');
      const inc = input.include ? globToRegExp(str(input.include)) : null;
      const files: string[] = [];
      if (await host.exists(root)) { const entries = await host.list(root).catch(() => null); if (entries) await walk(host, root, files); else files.push(root); }
      const hits: string[] = [];
      for (const f of files) {
        if (inc && !inc.test(f.split('/').pop() ?? '') && !inc.test(f)) continue;
        let c = ''; try { c = await host.readFile(f); } catch { continue; }
        if (c.length > 1_000_000) continue;
        c.split('\n').forEach((l, i) => { if (hits.length < 100 && re.test(l)) hits.push(`${f}:${i + 1}: ${l.slice(0, 300)}`); });
        if (hits.length >= 100) break;
      }
      return hits.length ? `Found ${hits.length} matches\n${hits.join('\n')}` : 'No files found';
    }
    case 'bash': {
      if (!host.exec) throw new Error('bash is not available on this host (browser build) — use read/write/edit/glob/grep instead');
      const cwd = input.workdir ? resolvePath(host, str(input.workdir)) : host.cwd;
      const r = await host.exec(str(input.command), { cwd, timeoutMs: Math.min(num(input.timeout, 120_000), 600_000) });
      let out = r.stdout;
      if (r.stderr) out += (out ? '\n' : '') + r.stderr;
      if (r.code !== 0) out += `\n\nExit code: ${r.code}`;
      return out.slice(0, 30_000) || '(no output)';
    }
    case 'webfetch': {
      if (!host.fetchText) throw new Error('webfetch is not available on this host');
      const r = await host.fetchText(str(input.url), num(input.timeout, 30) * 1000);
      let body = r.body;
      if (/html/i.test(r.contentType) && str(input.format, 'markdown') !== 'html') body = htmlToText(body);
      return body.slice(0, 50_000);
    }
    case 'todowrite': {
      const list = Array.isArray(input.todos) ? (input.todos as { content: string; status: string; priority?: string }[]) : [];
      todos.splice(0, todos.length, ...list);
      return JSON.stringify(todos, null, 2);
    }
    case 'todoread': return JSON.stringify(todos, null, 2);
    case 'skill': throw new Error(`skill "${str(input.name)}" is not available in the native Nebula OS agent`);
    case 'websearch': throw new Error('websearch is not available offline; use webfetch with a concrete URL');
    case 'task': {
      // sub-agent: same loop, its own transcript, result text returned to the parent
      let result = '';
      await runAgent(str(input.prompt), { ...o, history: [], maxSteps: 10, onEvent: e => { if (e.type === 'part' && e.part.type === 'text' && e.part.text) result = e.part.text; } });
      return result || '(subagent produced no text)';
    }
    default: throw new Error(`unknown tool ${name}`);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** Transport over the standard fetch API with a readable body stream (web, Bun, Node ≥ 18). */
export const fetchTransport: Transport = async (req, onLine) => {
  let res: Response;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, signal: req.signal });
  } catch (e) { return { status: 0, error: e instanceof Error ? e.message : String(e) }; }
  if (!res.ok) return { status: res.status, error: (await res.text().catch(() => '')).slice(0, 300) };
  if (!res.body) { for (const l of (await res.text()).split('\n')) onLine(l); return { status: 200 }; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).replace(/\r$/, '')); buf = buf.slice(i + 1); }
  }
  if (buf) onLine(buf);
  return { status: 200 };
};
