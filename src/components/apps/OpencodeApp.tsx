import { useCallback, useEffect, useRef, useState } from 'react';
import { useOS } from '../../lib/os';
import { bigPickleScript, bigPickleAnswer, type AgentMessage } from '../../lib/agent';
import { AppIcon } from '../icons';
import { Terminal, Trash2, SendHorizonal, ChevronRight, Circle, CheckCircle2, Square, Wifi, WifiOff, Settings2 } from 'lucide-react';
import { apiBase, getBridgeUrl, setBridgeUrl, isNativeApp } from '../../lib/bridge';

/**
 * opencode TUI.
 *  - REAL mode: talks to the real opencode server through the Bun bridge (opencode/bridge.ts → /api/opencode/*):
 *    sessions, prompt_async, SSE /event (text deltas, tool calls, step tokens). Model: opencode/big-pickle (free).
 *  - DEMO mode (bridge not running): the scripted Big Pickle showcase from lib/agent.ts.
 */


interface Msg extends AgentMessage { visible?: boolean }

// ---- real-mode types (subset of opencode event payloads) ----
interface OcPart {
  id: string; messageID: string; sessionID: string; type: string;
  text?: string; tool?: string; callID?: string;
  state?: { status: string; title?: string; input?: Record<string, unknown>; output?: string; error?: string };
  reason?: string; tokens?: { total?: number; input?: number; output?: number; reasoning?: number };
}
interface OcMessage { id: string; role: 'user' | 'assistant'; parts: OcPart[]; modelID?: string; error?: unknown }
interface BridgeInfo { ok: boolean; opencode?: string; model?: string; workspace?: string; bun?: string }

const FILES_LIST = [
  'C:/dev/game/src/main.cpp',
  'C:/dev/game/src/nebula_core.inc',
  'C:/dev/game/src/nebula.h',
  'C:/dev/game/assets/sprites.bin',
  'C:/dev/game/assets/models/starfighter.obj',
  'C:/dev/game/assets/models/interceptor.obj',
  'C:/dev/game/README.md',
  'C:/dev/game/build.bat',
];

function toolSummary(p: OcPart): { first: string; rest: string } {
  const inp = p.state?.input ?? {};
  const arg = (inp.filePath ?? inp.path ?? inp.command ?? inp.pattern ?? inp.url ?? inp.query ?? '') as string;
  const first = p.state?.title || String(arg).slice(0, 120);
  let rest = '';
  if (p.state?.status === 'error' && p.state.error) rest = p.state.error.slice(0, 600);
  else if (p.state?.status === 'completed' && p.state.output) rest = p.state.output.slice(0, 500) + (p.state.output.length > 500 ? '\n…' : '');
  return { first, rest };
}

export default function OpencodeApp() {
  const { openApp, pushToast } = useOS();
  const [mode, setMode] = useState<'probing' | 'real' | 'demo'>('probing');
  const [API, setAPI] = useState(apiBase());           // same-origin proxy or a remote bridge (Android / static hosting)
  const [showCfg, setShowCfg] = useState(false);
  const [cfgUrl, setCfgUrl] = useState(getBridgeUrl());
  const [bridge, setBridge] = useState<BridgeInfo | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---------- demo state ----------
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [fpsTick, setFpsTick] = useState(1745404);
  const startedRef = useRef(false);

  // ---------- real state ----------
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ocMessages, setOcMessages] = useState<OcMessage[]>([]);
  const [tokens, setTokens] = useState(0);
  const [touched, setTouched] = useState<string[]>([]);
  const [realError, setRealError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const sessionRef = useRef<string | null>(null);

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // ===== probe the bridge =====
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/bridge`, { signal: AbortSignal.timeout(3500) });
        const j = (await r.json()) as BridgeInfo;
        if (!cancelled && r.ok && j.ok) { setBridge(j); setMode('real'); return; }
      } catch { /* bridge not running */ }
      if (!cancelled) setMode('demo');
    })();
    return () => { cancelled = true; };
  }, [API]);

  const applyBridgeUrl = () => {
    setBridgeUrl(cfgUrl);
    setShowCfg(false);
    startedRef.current = false;
    setMode('probing');
    setAPI(apiBase());
  };

  // ===== REAL: create session + subscribe to events =====
  const upsertPart = useCallback((part: OcPart) => {
    setOcMessages(prev => {
      const idx = prev.findIndex(m => m.id === part.messageID);
      if (idx < 0) return [...prev, { id: part.messageID, role: 'assistant', parts: [part] }];
      const m = prev[idx];
      const pi = m.parts.findIndex(p => p.id === part.id);
      const parts = pi < 0 ? [...m.parts, part] : m.parts.map((p, i) => (i === pi ? { ...p, ...part } : p));
      const next = prev.slice(); next[idx] = { ...m, parts }; return next;
    });
    if (part.type === 'tool' && (part.tool === 'write' || part.tool === 'edit') && part.state?.status === 'completed') {
      const fp = String(part.state.input?.filePath ?? '');
      if (fp) setTouched(t => (t.includes(fp) ? t : [...t, fp]));
    }
    // context size of the latest step (input + output + reasoning), like the real TUI footer
    if (part.type === 'step-finish' && part.tokens?.total) setTokens(part.tokens.total);
  }, []);

  const startRealSession = useCallback(async () => {
    setRealError(null); setOcMessages([]); setTouched([]); setTokens(0);
    try {
      const r = await fetch(`${API}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Big Pickle — Nebula Strike (OS shell)' }) });
      if (!r.ok) throw new Error(`session: HTTP ${r.status}`);
      const s = (await r.json()) as { id: string };
      sessionRef.current = s.id; setSessionId(s.id);
      esRef.current?.close();
      const es = new EventSource(`${API}/event`);
      esRef.current = es;
      es.onmessage = ev => {
        let e: { type: string; properties: Record<string, unknown> };
        try { e = JSON.parse(ev.data); } catch { return; }
        const p = e.properties as Record<string, unknown>;
        const sid = sessionRef.current;
        switch (e.type) {
          case 'message.updated': {
            const info = p.info as { id: string; sessionID: string; role: 'user' | 'assistant'; modelID?: string; error?: unknown };
            if (info.sessionID !== sid) return;
            setOcMessages(prev => {
              const idx = prev.findIndex(m => m.id === info.id);
              if (idx < 0) return [...prev, { id: info.id, role: info.role, parts: [], modelID: info.modelID, error: info.error }];
              const next = prev.slice(); next[idx] = { ...prev[idx], role: info.role, modelID: info.modelID, error: info.error }; return next;
            });
            if (info.error) { const err = info.error as { name?: string; data?: { message?: string } }; setRealError(err.data?.message ?? err.name ?? 'error'); }
            break;
          }
          case 'message.part.updated': {
            const part = p.part as OcPart;
            if (part.sessionID !== sid) return;
            upsertPart(part);
            break;
          }
          case 'message.part.delta': {
            const d = p as { sessionID: string; messageID: string; partID: string; field: string; delta: string };
            if (d.sessionID !== sid || d.field !== 'text') return;
            setOcMessages(prev => prev.map(m => (m.id !== d.messageID ? m : { ...m, parts: m.parts.map(pt => (pt.id === d.partID ? { ...pt, text: (pt.text ?? '') + d.delta } : pt)) })));
            break;
          }
          case 'session.status': {
            const d = p as { sessionID: string; status: { type: string } };
            if (d.sessionID === sid) setBusy(d.status.type === 'busy' || d.status.type === 'retry');
            break;
          }
          case 'session.idle': if ((p as { sessionID: string }).sessionID === sid) setBusy(false); break;
          case 'session.error': {
            const d = p as { sessionID?: string; error?: { name?: string; data?: { message?: string } } };
            if (!d.sessionID || d.sessionID === sid) { setRealError(d.error?.data?.message ?? d.error?.name ?? 'session error'); setBusy(false); }
            break;
          }
          case 'permission.asked': {
            // auto-approve inside the sandboxed workspace (opencode.json already allows edit/bash)
            const d = p as { id: string; sessionID: string };
            if (d.sessionID === sid) void fetch(`${API}/session/${sid}/permissions/${d.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response: 'always' }) });
            break;
          }
        }
      };
      es.onerror = () => { /* EventSource reconnects automatically */ };
    } catch (e) {
      setRealError(e instanceof Error ? e.message : String(e));
    }
  }, [upsertPart, API]);

  useEffect(() => {
    if (mode !== 'real') return;
    const t = setTimeout(() => { void startRealSession(); }, 0);
    return () => { clearTimeout(t); esRef.current?.close(); esRef.current = null; };
  }, [mode, startRealSession]);

  const sendReal = async (text: string) => {
    const sid = sessionRef.current;
    if (!sid) return;
    setBusy(true); setRealError(null);
    const [providerID, modelID] = (bridge?.model ?? 'opencode/big-pickle').split('/');
    try {
      const r = await fetch(`${API}/session/${sid}/prompt_async`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: { providerID, modelID }, parts: [{ type: 'text', text }] }),
      });
      if (!r.ok && r.status !== 204) throw new Error(`prompt: HTTP ${r.status} ${await r.text()}`);
    } catch (e) {
      setRealError(e instanceof Error ? e.message : String(e)); setBusy(false);
    }
  };
  const abortReal = () => { const sid = sessionRef.current; if (sid) void fetch(`${API}/session/${sid}/abort`, { method: 'POST' }); };

  // ===== DEMO =====
  const runBuild = useCallback(async (prompt: string) => {
    if (busy) return;
    setBusy(true); setPhase('running'); setFiles([]);
    const script = bigPickleScript(prompt);
    setMessages([]);
    for (const m of script.messages) {
      setMessages(prev => [...prev, { ...m, visible: true }]);
      if (m.role === 'tool' && m.tool === 'write_file') {
        const path = m.content.split(' ')[1];
        setFiles(prev => (prev.includes(path) ? prev : [...prev, path]));
      }
      await sleep(m.role === 'tool' ? 420 : 650);
    }
    setPhase('done');
    setBusy(false);
    pushToast('opencode — Big Pickle', 'Nebula Strike built & autotested: WIN / 7500 pts', 'opencode');
  }, [busy, pushToast]);

  useEffect(() => {
    if (mode !== 'demo' || startedRef.current) return;
    startedRef.current = true;
    void runBuild('напиши пк игру «nebula strike» для big pickle studios, реальные 3d модели, а потом запусти и протестируй её');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== 'demo') return;
    const t = window.setInterval(() => setFpsTick(v => v + Math.floor(Math.random() * 40000 - 20000)), 900);
    return () => window.clearInterval(t);
  }, [mode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, ocMessages, busy]);

  const submit = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    if (mode === 'real') { await sendReal(q); return; }
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: q, time: Date.now() }]);
    setBusy(true);
    await sleep(280);
    const canned = bigPickleAnswer(q);
    setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: canned ?? 'понял. могу запустить autotest, benchmark, открыть Steam-страницу или показать fps — спроси конкретнее.', time: Date.now() }]);
    setBusy(false);
  };

  const clear = () => {
    if (mode === 'real') { abortReal(); void startRealSession(); return; }
    setMessages([{ id: Date.now(), role: 'system', content: 'opencode (demo) · model: big-pickle · bridge offline\nЗапустите `npm run opencode` (bun run opencode/bridge.ts) — на телефоне/Android укажите адрес моста через ⚙.\nЗадай вопрос: fps / exe / steam / тест / source — или: /build <что построить>', time: Date.now() }]);
  };

  const renderDemo = (m: Msg) => {
    if (m.role === 'tool') {
      const first = m.content.split('\n')[0];
      const rest = m.content.split('\n').slice(1).join('\n');
      return (
        <div className="rounded border border-[#3dd68c]/25 bg-[#3dd68c]/5 px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[#3dd68c]"><ChevronRight size={11} /><span className="font-bold">{m.tool}</span><span className="text-[#3dd68c]/60 truncate">{first.slice(0, 90)}</span></div>
          {rest && <pre className="mt-1 whitespace-pre-wrap text-[#9fe8c0]/80 text-[10px] leading-snug">{rest}</pre>}
        </div>
      );
    }
    return <div className="whitespace-pre-wrap">{m.content}</div>;
  };

  const renderRealPart = (p: OcPart) => {
    if (p.type === 'text') return p.text ? <div className="whitespace-pre-wrap text-[#d6dae2]">{p.text}</div> : null;
    if (p.type === 'reasoning') return <div className="text-[#6b7280] italic text-[10px]">thinking…</div>;
    if (p.type === 'tool') {
      const { first, rest } = toolSummary(p);
      const st = p.state?.status ?? 'pending';
      const color = st === 'error' ? 'text-[#ff6b6b] border-[#ff6b6b]/30 bg-[#ff6b6b]/5' : st === 'completed' ? 'text-[#3dd68c] border-[#3dd68c]/25 bg-[#3dd68c]/5' : 'text-[#ffd166] border-[#ffd166]/25 bg-[#ffd166]/5';
      return (
        <div className={`rounded border px-2 py-1.5 ${color}`}>
          <div className="flex items-center gap-1.5"><ChevronRight size={11} /><span className="font-bold">{p.tool}</span><span className="opacity-60 truncate">{first}</span><span className="ml-auto text-[9px] uppercase opacity-70">{st}</span></div>
          {rest && <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] leading-snug opacity-80">{rest}</pre>}
        </div>
      );
    }
    if (p.type === 'step-finish') return p.tokens?.total ? <div className="text-[9px] text-[#555b68]">step · {p.reason} · tokens {p.tokens.total.toLocaleString()}</div> : null;
    return null;
  };

  const modelLabel = mode === 'real' ? (bridge?.model ?? 'opencode/big-pickle') : 'big-pickle (demo)';
  const workspaceLabel = mode === 'real' ? (bridge?.workspace ?? '').split(/[\\/]/).filter(Boolean).slice(-2).join('/') || 'workspace' : 'C:\\dev\\game';
  const sidebarFiles = mode === 'real' ? touched : FILES_LIST;

  return (
    <div className="flex h-full flex-col bg-[#111318] text-[#d6dae2] font-mono text-[11px]">
      {/* TUI header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/5 bg-[#16181d] px-3">
        <Terminal size={13} className="text-[#3dd68c]" />
        <span className="text-[#8a8f9c]">opencode</span>
        <span className="text-[#3dd68c]">{modelLabel}</span>
        <span className="text-[#555b68]">·</span>
        <span className="text-[#8a8f9c] truncate">{workspaceLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          {mode === 'real' ? (
            <span className="flex items-center gap-1 text-[9px] text-[#3dd68c]" title={`opencode v${bridge?.opencode} · Bun ${bridge?.bun}`}><Wifi size={11} />live · v{bridge?.opencode}</span>
          ) : mode === 'demo' ? (
            <span className="flex items-center gap-1 text-[9px] text-[#ffd166]" title="run: bun run opencode/bridge.ts"><WifiOff size={11} />demo · bridge offline</span>
          ) : (
            <span className="text-[9px] text-[#8a8f9c]">connecting…</span>
          )}
          {mode === 'real' && busy && <button onClick={abortReal} title="Abort" className="rounded p-1 text-[#ff6b6b] hover:bg-white/10"><Square size={12} /></button>}
          <button onClick={() => setShowCfg(v => !v)} title="Bridge URL (Android / remote PC)" aria-label="Bridge settings" className={`rounded p-1 hover:bg-white/10 ${getBridgeUrl() ? 'text-[#3dd68c]' : ''}`}><Settings2 size={13} /></button>
          <button onClick={clear} title="New session" className="rounded p-1 hover:bg-white/10"><Trash2 size={13} /></button>
        </div>
      </div>
      {showCfg && (
        <form className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#111318] px-3 py-2 text-[10px]" onSubmit={e => { e.preventDefault(); applyBridgeUrl(); }} data-bridge-config>
          <span className="text-[#8a8f9c]">bridge URL</span>
          <input value={cfgUrl} onChange={e => setCfgUrl(e.target.value)} placeholder={isNativeApp() ? 'http://192.168.1.10:8787  (PC running: npm run opencode)' : 'empty = same origin (/api/opencode)'} className="min-w-[220px] flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[#e8f4ff] outline-none focus:border-[#3dd68c]/60" spellCheck={false} />
          <button type="submit" className="rounded border border-[#3dd68c]/50 bg-[#3dd68c]/15 px-2 py-1 font-bold text-[#3dd68c]">connect</button>
          <button type="button" onClick={() => { setCfgUrl(''); setBridgeUrl(''); setShowCfg(false); startedRef.current = false; setMode('probing'); setAPI(apiBase()); }} className="rounded border border-white/10 px-2 py-1 text-[#8a8f9c]">reset</button>
          <span className="basis-full text-[#555b68]">{isNativeApp() ? 'В Android‑приложении мост запускается на компьютере в той же Wi‑Fi сети: `npm run opencode` → укажите http://IP‑компьютера:8787' : 'Пусто — тот же сервер (vite/мост). Для телефона откройте http://IP‑компьютера:8787 или укажите его здесь.'}</span>
        </form>
      )}

      <div className="flex min-h-0 flex-1">
        {/* file tree */}
        <div className="hidden w-44 shrink-0 flex-col border-r border-white/5 bg-[#14161b] sm:flex">
          <div className="px-3 pt-2 pb-1 text-[9px] tracking-widest text-[#555b68]">{mode === 'real' ? 'FILES TOUCHED' : 'PROJECT — GAME'}</div>
          <div className="flex-1 overflow-y-auto px-1.5 pb-2">
            {sidebarFiles.length === 0 && <div className="px-1.5 text-[10px] text-[#555b68]">— none yet —</div>}
            {sidebarFiles.map(f => {
              const active = mode === 'real' ? true : files.includes(f);
              const name = f.split(/[\\/]/).pop()!;
              return (
                <div key={f} title={f} className={`flex items-center gap-1.5 rounded px-1.5 py-[3px] text-[10px] ${active ? 'text-[#3dd68c]' : 'text-[#7d8290]'}`}>
                  {active ? <CheckCircle2 size={10} className="shrink-0" /> : <Circle size={8} className="shrink-0 opacity-40" />}
                  <span className="truncate">{name}</span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/5 p-2 text-[9px] leading-relaxed text-[#555b68]">
            <div>nebula-strike v1.0.0</div>
            <div>build: zig cc 0.17</div>
            <div>targets: win64 · wasm64 · wasm32</div>
            {mode === 'real' && <div className="text-[#3dd68c]/70">bridge: bun {bridge?.bun}</div>}
          </div>
        </div>

        {/* conversation */}
        <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto px-4 py-3 leading-[1.5]">
          {mode === 'probing' && <div className="text-[#555b68]">connecting to opencode bridge…</div>}

          {mode === 'real' && (
            <>
              {ocMessages.length === 0 && (
                <div className="whitespace-pre-wrap rounded border border-white/5 bg-white/[0.02] p-2 text-[#8a8f9c]">
                  {`opencode v${bridge?.opencode} · real session ${sessionId ? sessionId.slice(0, 16) + '…' : '…'}\nmodel ${modelLabel} · workspace ${bridge?.workspace}\nThis is the real agent: it can read, edit and run things inside the workspace.\nTry: «What does game/nebula_core.inc do?» · «Run the wasm32 autotest with node» · «Add a pause key (P) to nebula_core.inc»`}
                </div>
              )}
              {ocMessages.map(m => (
                <div key={m.id} className="mb-2.5">
                  {m.role === 'user' ? (
                    <div className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-[#59f2ff]">❯</span><div className="text-[#e8f4ff] whitespace-pre-wrap">{m.parts.filter(p => p.type === 'text').map(p => p.text).join('\n')}</div></div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <AppIcon id="opencode" size={13} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {m.parts.map(p => <div key={p.id}>{renderRealPart(p)}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {realError && <div className="rounded border border-[#ff6b6b]/40 bg-[#ff6b6b]/10 p-2 text-[#ff9b9b]">error: {realError}</div>}
              {busy && <div className="text-[#3dd68c]/70 animate-pulse">big pickle is working…</div>}
            </>
          )}

          {mode === 'demo' && (
            <>
              {messages.length === 0 && <div className="text-[#555b68]">starting big pickle…</div>}
              {messages.map(m => (
                <div key={m.id} className="mb-2.5">
                  {m.role === 'user' && (
                    <div className="flex items-start gap-2"><span className="mt-0.5 shrink-0 text-[#59f2ff]">❯</span><div className="text-[#e8f4ff]">{m.content}</div></div>
                  )}
                  {m.role === 'assistant' && (
                    <div className="flex items-start gap-2"><AppIcon id="opencode" size={13} className="mt-0.5 shrink-0" /><div className="text-[#d6dae2]">{m.content}</div></div>
                  )}
                  {m.role === 'tool' && renderDemo(m)}
                  {m.role === 'system' && <div className="whitespace-pre-wrap rounded border border-white/5 bg-white/[0.02] p-2 text-[#8a8f9c]">{m.content}</div>}
                </div>
              ))}
              {busy && <div className="text-[#3dd68c]/70 animate-pulse">big pickle is thinking…</div>}
              {phase === 'done' && (
                <button onClick={() => openApp('nebula')} className="mt-2 rounded-md border border-[#3dd68c]/50 bg-[#3dd68c]/15 px-4 py-2 text-[11px] font-bold text-[#3dd68c] hover:bg-[#3dd68c]/25">
                  ▶ LAUNCH NEBULA STRIKE (WASM64)
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* input + status bar */}
      <form className="flex h-10 shrink-0 items-center gap-2 border-t border-white/10 bg-[#16181d] px-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <ChevronRight size={13} className="shrink-0 text-[#3dd68c]" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={busy || mode === 'probing'}
          placeholder={busy ? 'big pickle is working…' : mode === 'real' ? `message ${modelLabel} — real agent in ${workspaceLabel}` : 'message big-pickle (demo) — try: fps / steam / exe / тест / source'}
          className="w-full bg-transparent outline-none placeholder-[#4a4f5c] text-[#e8f4ff] caret-[#3dd68c]"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded p-1.5 text-[#3dd68c] hover:bg-white/10 disabled:opacity-30"><SendHorizonal size={14} /></button>
      </form>
      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-white/5 bg-[#101218] px-3 text-[9px] text-[#555b68]">
        {mode === 'real' ? (
          <>
            <span>model: <span className="text-[#3dd68c]">{modelLabel}</span> (opencode zen · free)</span>
            <span>session: {sessionId ? sessionId.slice(4, 14) : '—'}</span>
            <span>tokens: {tokens.toLocaleString()}</span>
            <span className="ml-auto text-[#3dd68c]">bridge /api/opencode → opencode serve</span>
          </>
        ) : (
          <>
            <span>model: <span className="text-[#3dd68c]">big-pickle (demo)</span></span>
            <span>ctx: 32k</span>
            <span>tokens: 12,842</span>
            <span className="ml-auto text-[#3dd68c]">logic fps: {fpsTick.toLocaleString()}</span>
            <span>vsync: 60</span>
          </>
        )}
      </div>
    </div>
  );
}
