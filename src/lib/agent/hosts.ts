/**
 * Tool hosts + transports for the native agent.
 *
 *  Android (Capacitor APK)  → NebulaNative plugin: real /system/bin/sh, real files in the app's
 *                             external workspace, streaming HTTPS from Java (no CORS, no PC).
 *  Web (browser)            → in-browser VFS persisted in localStorage; the model is reached through
 *                             the bridge's `/zen` pass-through because opencode.ai sends no CORS headers.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { ZEN_URL, fetchTransport, type ToolHost, type Transport } from './core';
import { isNativeApp } from '../bridge';

// ---------- Capacitor plugin surface (android/app/src/main/java/com/bigpickle/nebulaos/NebulaNativePlugin.java) ----------
export interface NebulaNativePlugin {
  info(): Promise<{ platform: string; workspace: string; tmp: string; abi: string; sdk: number; release: string; shell: string; webview?: string }>;
  exec(o: { command: string; cwd: string; timeoutMs: number }): Promise<{ stdout: string; stderr: string; code: number }>;
  readFile(o: { path: string }): Promise<{ content: string }>;
  writeFile(o: { path: string; content: string }): Promise<void>;
  list(o: { path: string }): Promise<{ entries: { name: string; dir: boolean; size: number }[] }>;
  exists(o: { path: string }): Promise<{ exists: boolean; dir: boolean }>;
  httpStream(o: { id: string; url: string; method: string; headers: Record<string, string>; body: string }): Promise<{ started: boolean }>;
  httpFetch(o: { url: string; timeoutMs: number }): Promise<{ status: number; contentType: string; body: string }>;
  addListener(event: 'httpLine', cb: (e: { id: string; line: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'httpEnd', cb: (e: { id: string; status: number; error?: string }) => void): Promise<PluginListenerHandle>;
}
export const NebulaNative = registerPlugin<NebulaNativePlugin>('NebulaNative');

export interface NativeInfo { platform: string; workspace: string; tmp: string; abi: string; sdk: number; release: string; shell: string; webview?: string }

/** Android host: everything runs on the phone. */
export async function androidHost(): Promise<{ host: ToolHost; info: NativeInfo }> {
  const info = await NebulaNative.info();
  const host: ToolHost = {
    cwd: info.workspace,
    platform: 'android',
    readFile: async p => (await NebulaNative.readFile({ path: p })).content,
    writeFile: async (p, c) => { await NebulaNative.writeFile({ path: p, content: c }); },
    list: async p => (await NebulaNative.list({ path: p })).entries.map(e => ({ name: e.name, dir: e.dir })),
    exists: async p => (await NebulaNative.exists({ path: p })).exists,
    exec: async (command, o) => NebulaNative.exec({ command: command.split('/tmp/opencode').join(`${info.tmp}/opencode`), cwd: o.cwd, timeoutMs: o.timeoutMs }),
    fetchText: async (url, timeoutMs) => NebulaNative.httpFetch({ url, timeoutMs }),
  };
  return { host, info };
}

/** Android transport: streaming HTTPS done by the Java side, lines delivered as plugin events. */
export const androidTransport: Transport = async (req, onLine) => {
  const id = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return new Promise(resolve => {
    let lineH: PluginListenerHandle | undefined, endH: PluginListenerHandle | undefined;
    const done = (r: { status: number; error?: string }) => { void lineH?.remove(); void endH?.remove(); resolve(r); };
    void (async () => {
      lineH = await NebulaNative.addListener('httpLine', e => { if (e.id === id) onLine(e.line); });
      endH = await NebulaNative.addListener('httpEnd', e => { if (e.id === id) done({ status: e.status, error: e.error }); });
      req.signal?.addEventListener('abort', () => done({ status: 0, error: 'aborted' }));
      try {
        await NebulaNative.httpStream({ id, url: req.url, method: 'POST', headers: req.headers, body: req.body });
      } catch (e) { done({ status: 0, error: e instanceof Error ? e.message : String(e) }); }
    })();
  });
};

// ---------- browser VFS host ----------
const VFS_KEY = 'nebula.native.vfs';
const VFS_ROOT = '/workspace';
type Vfs = Record<string, string>; // absolute path → content (files only)

const SEED: Vfs = {
  [`${VFS_ROOT}/README.md`]: '# Nebula OS native workspace\n\nThis folder lives inside your browser (localStorage). On Android the same agent works on real files in the app workspace and runs real shell commands.\n',
  [`${VFS_ROOT}/notes.txt`]: 'ideas:\n- add a pause key to Nebula Strike\n- port HUD to WebGL text atlas\n',
};
function loadVfs(): Vfs {
  try { const raw = localStorage.getItem(VFS_KEY); if (raw) return JSON.parse(raw) as Vfs; } catch { /* ignore */ }
  return { ...SEED };
}
function saveVfs(v: Vfs) { try { localStorage.setItem(VFS_KEY, JSON.stringify(v)); } catch { /* quota */ } }

export function browserHost(): ToolHost {
  const vfs = loadVfs();
  const children = (dir: string) => {
    const prefix = dir === '/' ? '/' : dir + '/';
    const out = new Map<string, boolean>();
    for (const p of Object.keys(vfs)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const i = rest.indexOf('/');
      if (i < 0) out.set(rest, false); else out.set(rest.slice(0, i), true);
    }
    return out;
  };
  return {
    cwd: VFS_ROOT,
    platform: 'browser',
    readFile: async p => { if (!(p in vfs)) throw new Error(`ENOENT: no such file ${p}`); return vfs[p]; },
    writeFile: async (p, c) => { vfs[p] = c; saveVfs(vfs); },
    list: async p => { const m = children(p); if (!m.size && !(p === VFS_ROOT || p === '/')) throw new Error(`ENOENT: no such directory ${p}`); return [...m.entries()].map(([name, dir]) => ({ name, dir })); },
    exists: async p => p in vfs || children(p).size > 0 || p === VFS_ROOT || p === '/',
    fetchText: async (url, timeoutMs) => { const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }); return { status: r.status, contentType: r.headers.get('content-type') ?? '', body: await r.text() }; },
  };
}
export const resetBrowserVfs = () => { try { localStorage.removeItem(VFS_KEY); } catch { /* ignore */ } };

/** Web transport: the bridge forwards to opencode.ai (adds the User-Agent a browser cannot set). */
export function proxyTransport(apiBase: string): Transport {
  return (req, onLine) => {
    const headers = { ...req.headers };
    delete headers['user-agent'];
    return fetchTransport({ ...req, url: `${apiBase}/zen/chat/completions`, headers }, onLine);
  };
}

export const directZenUrl = ZEN_URL;
export const canRunNativeAgent = () => isNativeApp();
