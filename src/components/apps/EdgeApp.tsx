import { useRef, useState } from 'react';
import { AppIcon } from '../icons';
import { useOS } from '../../lib/os';
import { ArrowLeft, ArrowRight, RotateCw, Home, Lock, Search, Star, Download, Plus, CheckCircle2, X } from 'lucide-react';

interface Tab { id: number; title: string; url: string }

const BOOKMARKS: { name: string; url: string; icon: string }[] = [
  { name: 'opencode — open source AI coding agent', url: 'https://opencode.ai/', icon: 'opencode' },
  { name: 'Steam', url: 'https://store.steampowered.com/', icon: 'steam' },
  { name: 'Epic Games Store', url: 'https://store.epicgames.com/', icon: 'epic' },
  { name: 'Node.js', url: 'https://nodejs.org/', icon: 'terminal' },
  { name: 'Pyodide (Python for WASM)', url: 'https://pyodide.org/', icon: 'wsl' },
  { name: 'Big Pickle Studios — Nebula Strike', url: 'about:nebula', icon: 'game' },
];

// "about" pages rendered natively inside Edge (real content, not iframes of nothing)
function AboutNebula() {
  const { openApp } = useOS();
  return (
    <div className="h-full overflow-y-auto bg-[#0b1020] text-slate-100">
      <div className="relative h-44 overflow-hidden">
        <img src="/assets/game-capsule.jpg" alt="Nebula Strike key art" className="absolute inset-0 h-full w-full object-cover object-[68%_30%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1020] via-[#0b1020aa] to-transparent" />
        <div className="relative p-6">
          <div className="text-[10px] tracking-[0.3em] text-cyan-400 font-bold">BIG PICKLE STUDIOS</div>
          <h1 className="text-4xl font-black tracking-tight mt-1">NEBULA <span className="text-cyan-400">STRIKE</span></h1>
          <div className="text-xs text-slate-300 mt-1">Arcade space shmup · 5 waves · one starfighter</div>
        </div>
      </div>
      <div className="p-6 max-w-2xl">
        <button onClick={() => openApp('nebula')} className="rounded-md bg-cyan-500 px-6 py-2.5 font-bold text-slate-900 hover:bg-cyan-400 transition-colors shadow-[0_0_24px_rgba(56,214,255,0.4)]">
          ▶ PLAY NOW (runs the real WASM64 build)
        </button>
        <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"><div className="text-cyan-400 font-bold">ENGINE</div>Deterministic C core → WASM64 (memory64), WASM32, native Win32 EXE</div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"><div className="text-cyan-400 font-bold">AUTOTEST</div>WIN · 7500 pts · wave 5/5 · 2563 frames · 3 lives (headless AI pilot)</div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"><div className="text-cyan-400 font-bold">DOWNLOAD</div>NebulaStrike.exe — 229 KB PE32+ x86-64, zero dependencies</div>
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3"><div className="text-cyan-400 font-bold">SOURCE</div>34 files · C core + React OS shell · zig cc cross-compile</div>
        </div>
      </div>
    </div>
  );
}

export default function EdgeApp() {
  const { pushToast } = useOS();
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, title: 'New Tab', url: 'about:newtab' }]);
  const [active, setActive] = useState(1);
  const [addr, setAddr] = useState('about:newtab');
  const idRef = useRef(2);
  const activeTab = tabs.find(t => t.id === active)!;

  // sync address bar with the active tab (state-from-props pattern, no effect needed)
  const [addrTabUrl, setAddrTabUrl] = useState(activeTab.url);
  if (addrTabUrl !== activeTab.url) { setAddrTabUrl(activeTab.url); setAddr(activeTab.url); }

  const navigate = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^(https?:|about:|file:)/i.test(url)) url = 'https://' + url;
    setTabs(ts => ts.map(t => (t.id === active ? { ...t, url, title: url.startsWith('about:') ? (url === 'about:nebula' ? 'Nebula Strike — Big Pickle Studios' : 'New Tab') : url.replace(/^https?:\/\//, '').split('/')[0] } : t)));
    setAddr(url);
  };

  const addTab = () => {
    const id = idRef.current++;
    setTabs(ts => [...ts, { id, title: 'New Tab', url: 'about:newtab' }]);
    setActive(id);
  };
  const closeTab = (id: number) => {
    setTabs(ts => {
      const next = ts.filter(t => t.id !== id);
      if (next.length === 0) { const nid = idRef.current++; next.push({ id: nid, title: 'New Tab', url: 'about:newtab' }); }
      if (id === active) setActive(next[next.length - 1].id);
      return next;
    });
  };

  const isExternal = /^https?:/i.test(activeTab.url);

  return (
    <div className="flex h-full flex-col bg-[#f3f3f3] text-[#1b1b1b]">
      {/* tab strip */}
      <div className="flex items-end gap-0.5 bg-[#dee1e6] px-2 pt-1.5">
        {tabs.map(t => (
          <div key={t.id} onClick={() => setActive(t.id)}
            className={`group flex max-w-[200px] min-w-[120px] cursor-pointer items-center gap-1.5 rounded-t-lg px-2.5 py-1.5 text-[11px] ${t.id === active ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>
            <AppIcon id={t.url.startsWith('about:nebula') ? 'game' : 'edge'} size={13} />
            <span className="flex-1 truncate">{t.title}</span>
            <button onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-200"><X size={11} /></button>
          </div>
        ))}
        <button onClick={addTab} className="mb-1 rounded p-1.5 hover:bg-slate-300"><Plus size={14} /></button>
      </div>
      {/* nav toolbar */}
      <div className="flex items-center gap-1.5 border-b border-slate-300 bg-white px-2 py-1.5">
        <button className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => navigate('about:newtab')}><ArrowLeft size={15} /></button>
        <button className="rounded-full p-1.5 text-slate-300"><ArrowRight size={15} /></button>
        <button className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => navigate(activeTab.url)}><RotateCw size={15} /></button>
        <button className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => navigate('about:newtab')}><Home size={15} /></button>
        <form className="flex flex-1 items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 focus-within:border-sky-500 focus-within:bg-white" onSubmit={(e) => { e.preventDefault(); navigate(addr); }}>
          <Lock size={11} className="text-emerald-600 shrink-0" />
          <input value={addr} onChange={e => setAddr(e.target.value)} spellCheck={false} className="w-full bg-transparent text-[12px] outline-none" aria-label="Address bar" />
          <button type="submit"><Search size={13} className="text-slate-500" /></button>
        </form>
        <button className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100" onClick={() => pushToast('Edge', 'Added to favorites', 'info')}><Star size={15} /></button>
        <a href="/downloads/NebulaStrike_BigPickle_Source.zip" download className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100" title="Download source ZIP"><Download size={15} /></a>
      </div>
      {/* content */}
      <div className="relative min-h-0 flex-1 bg-white">
        {activeTab.url === 'about:newtab' && (
          <div className="h-full overflow-y-auto bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] text-white">
            <div className="mx-auto max-w-2xl pt-14 px-6 text-center">
              <div className="text-6xl font-light tracking-tight"><span className="text-sky-400 font-semibold">edge</span></div>
              <form className="mt-6 flex items-center rounded-full bg-white text-slate-800 shadow-2xl overflow-hidden" onSubmit={(e) => { e.preventDefault(); const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value; navigate('https://www.bing.com/search?q=' + encodeURIComponent(q)); }}>
                <input name="q" placeholder="Search the web with Bing" className="w-full px-5 py-3 outline-none text-sm" autoFocus />
                <button className="px-5 text-sky-600 font-semibold text-sm">Search</button>
              </form>
              <div className="mt-8 grid grid-cols-3 gap-3">
                {BOOKMARKS.map(b => (
                  <button key={b.name} onClick={() => navigate(b.url)} className="group flex flex-col items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-4 hover:bg-white/15 transition-all hover:-translate-y-0.5">
                    <AppIcon id={b.icon} size={34} />
                    <span className="text-[10px] leading-tight text-slate-200 group-hover:text-white">{b.name.slice(0, 44)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-6 text-[10px] text-slate-400">Microsoft Edge · Windows 10 · signed in as BigPickle</div>
            </div>
          </div>
        )}
        {activeTab.url === 'about:nebula' && <AboutNebula />}
        {isExternal && (
          <iframe key={activeTab.url} src={activeTab.url} title={activeTab.title} className="absolute inset-0 h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer" />
        )}
      </div>
      {/* status bar */}
      <div className="flex h-6 items-center gap-2 border-t border-slate-300 bg-[#f3f3f3] px-3 text-[10px] text-slate-500">
        <CheckCircle2 size={11} className="text-emerald-600" />
        <span className="truncate">{isExternal ? activeTab.url : activeTab.url}</span>
      </div>
    </div>
  );
}
