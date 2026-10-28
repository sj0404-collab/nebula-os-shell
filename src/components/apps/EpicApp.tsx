import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../icons';
import { useOS } from '../../lib/os';
import { ArrowLeft, Search, X, Gamepad2, User, Bell, ShoppingCart, CheckCircle2, LayoutGrid, Flame, Play, Download as DownloadIcon } from 'lucide-react';

const GAMES = [
  { name: 'Nebula Strike', price: 'Free', discount: 0, owned: true, capsule: '/assets/game-capsule.jpg', tags: ['Action', 'Shooter', 'Space'] },
  { name: 'Big Pickle: Depot Sim', price: '$9.99', discount: 20, owned: false, capsule: '/assets/game-capsule.jpg', tags: ['Simulation', 'Management'] },
  { name: 'WASM64 Racer', price: '$4.99', discount: 0, owned: false, capsule: '/assets/game-capsule.jpg', tags: ['Racing', 'Early Access'] },
  { name: 'Terminal Velocity: Big Pickle', price: '$14.99', discount: 50, owned: false, capsule: '/assets/game-capsule.jpg', tags: ['Arcade', 'Roguelite'] },
];

type View = 'vault' | 'store' | 'browse';

export default function EpicApp() {
  const { openApp, pushToast } = useOS();
  const [view, setView] = useState<View>('vault');
  const [query, setQuery] = useState('');
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(100);
  const [installed, setInstalled] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const dlTimer = useRef<number | null>(null);

  useEffect(() => () => { if (dlTimer.current) window.clearInterval(dlTimer.current); }, []);

  const filtered = GAMES.filter(g => !query || g.name.toLowerCase().includes(query.toLowerCase()) || g.tags.some(t => t.toLowerCase().includes(query.toLowerCase())));

  const acquire = (g: typeof GAMES[number]) => {
    if (g.owned) { openApp('nebula'); return; }
    setDownloadingId(g.name); setProgress(0);
    const t = window.setInterval(() => {
      setProgress(p => {
        if (p >= 100) { window.clearInterval(t); setDownloadingId(null); pushToast('Epic Games', `${g.name} added to your library`, 'epic'); return 100; }
        return p + Math.random() * 18;
      });
    }, 110);
    dlTimer.current = t;
  };

  const installSize = '234 MB';

  return (
    <div className="flex h-full bg-[#18181c] text-[#ececec]">
      {/* left rail */}
      <div className="w-14 shrink-0 flex flex-col items-center border-r border-white/5 py-3 gap-1 bg-[#1d1d21]">
        <button className="rounded-lg p-2 hover:bg-white/10"><ArrowLeft size={17} /></button>
        <div className="my-2 h-px w-6 bg-white/10" />
        <RailBtn active={view === 'vault'} onClick={() => setView('vault')} label="Library"><Gamepad2 size={19} /></RailBtn>
        <RailBtn active={view === 'store'} onClick={() => setView('store')} label="Store"><ShoppingCart size={19} /></RailBtn>
        <RailBtn active={view === 'browse'} onClick={() => setView('browse')} label="Browse"><LayoutGrid size={19} /></RailBtn>
        <div className="mt-auto flex flex-col gap-1">
          <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => pushToast('Epic Games', 'No new notifications', 'epic')}><Bell size={19} /></button>
          <button className="rounded-lg p-2 hover:bg-white/10"><User size={19} /></button>
        </div>
      </div>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* top bar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/5 px-4">
          <AppIcon id="epic" size={20} />
          <div className="text-[12px] font-black tracking-wide text-white">EPIC GAMES LAUNCHER</div>
          <form className="ml-auto flex w-56 items-center gap-2 rounded bg-white/5 px-2.5 py-1.5 text-[11px]" onSubmit={e => e.preventDefault()}>
            <Search size={12} className="text-white/40" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search store" className="w-full bg-transparent outline-none placeholder-white/35" />
            {query && <button type="button" onClick={() => setQuery('')}><X size={12} /></button>}
          </form>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {view === 'vault' && (
            <div className="p-5">
              <div className="text-[10px] tracking-widest text-white/50 font-bold">MY LIBRARY</div>
              {/* hero — Nebula Strike */}
              <div className="relative mt-2 h-56 overflow-hidden rounded-lg border border-white/10">
                <img src="/assets/game-capsule.jpg" alt="Nebula Strike" className="absolute inset-0 h-full w-full object-cover object-[72%_30%]" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
                <div className="relative flex h-full flex-col justify-center gap-2 p-6">
                  <div className="text-[10px] text-cyan-400 font-bold tracking-widest">BIG PICKLE STUDIOS</div>
                  <h1 className="text-4xl font-black text-white">NEBULA STRIKE</h1>
                  <div className="flex items-center gap-2">
                    {installed ? (
                      <button onClick={() => openApp('nebula')} className="flex items-center gap-2 rounded bg-white px-6 py-2 text-[13px] font-bold text-black hover:bg-slate-200"><Play size={15} fill="black" /> LAUNCH</button>
                    ) : (
                      <button onClick={() => { setInstalling(true); setProgress(0); const t = window.setInterval(() => setProgress(p => { if (p >= 100) { window.clearInterval(t); setInstalling(false); setInstalled(true); pushToast('Epic Games', 'Nebula Strike is ready to play', 'epic'); return 100; } return p + 12; }), 120); }} className="flex items-center gap-2 rounded bg-white px-6 py-2 text-[13px] font-bold text-black"><DownloadIcon size={15} /> INSTALL</button>
                    )}
                    <span className="text-[10px] text-white/60">{installed ? 'Installed · v1.0.0 · 234 MB' : 'Not installed'}</span>
                  </div>
                  {installing && <div className="h-1.5 w-56 overflow-hidden rounded bg-white/15"><div className="h-full bg-white transition-all" style={{ width: `${Math.min(100, progress)}%` }} /></div>}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {GAMES.filter(g => g.owned).map(g => (
                  <button key={g.name} onClick={() => openApp('nebula')} className="group text-left">
                    <img src={g.capsule} alt={g.name} className="h-28 w-full rounded-md object-cover border border-white/10 group-hover:border-cyan-400/60 transition-all" />
                    <div className="mt-1 text-[10px] font-semibold text-white/90">{g.name}</div>
                    <div className="text-[9px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={9} /> Installed</div>
                  </button>
                ))}
                <div className="rounded-md border border-dashed border-white/15 grid place-items-center text-[10px] text-white/35 h-40">+ More from Big Pickle</div>
              </div>
            </div>
          )}

          {view === 'store' && (
            <div>
              <div className="relative h-44 flex items-center">
                <img src="/assets/game-capsule.jpg" alt="Free Game" className="absolute inset-0 h-full w-full object-cover opacity-75" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent" />
                <div className="relative p-6">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#f5c518]"><Flame size={12} /> FREE GAME</div>
                  <h2 className="text-3xl font-black text-white">NEBULA STRIKE</h2>
                  <button onClick={() => openApp('nebula')} className="mt-2 rounded bg-[#0074e4] px-5 py-1.5 text-[12px] font-bold hover:bg-[#1084f4]">ADD TO LIBRARY</button>
                </div>
              </div>
              <div className="p-4">
                <div className="text-[10px] tracking-widest text-white/50 font-bold mb-2">FEATURED</div>
                <div className="grid grid-cols-4 gap-3">
                  {filtered.map(g => (
                    <div key={g.name} className="rounded-md overflow-hidden bg-[#202026] border border-white/5">
                      <div className="relative">
                        <img src={g.capsule} alt={g.name} className="h-28 w-full object-cover" loading="lazy" />
                        {g.discount > 0 && <span className="absolute bottom-1 left-1 rounded bg-[#0074e4] px-1.5 py-0.5 text-[9px] font-bold">-{g.discount}%</span>}
                      </div>
                      <div className="p-2">
                        <div className="text-[10px] font-bold truncate">{g.name}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-white/70">{g.price}</span>
                          <button onClick={() => acquire(g)} className="rounded bg-white/10 px-2 py-0.5 text-[9px] font-bold hover:bg-[#0074e4]">
                            {downloadingId === g.name ? `${Math.min(99, Math.floor(progress))}%` : g.owned ? 'OWNED' : 'GET'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === 'browse' && (
            <div className="p-5">
              <div className="text-[10px] tracking-widest text-white/50 font-bold">BROWSE — {filtered.length} RESULTS</div>
              <div className="mt-2 divide-y divide-white/5 rounded-lg border border-white/10 overflow-hidden">
                {filtered.map(g => (
                  <div key={g.name} className="flex items-center gap-3 bg-[#1f1f24] p-2.5 hover:bg-[#26262c]">
                    <img src={g.capsule} alt={g.name} className="h-14 w-24 rounded object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1"><div className="text-[11px] font-bold">{g.name}</div><div className="text-[9px] text-white/40">{g.tags.join(' · ')}</div></div>
                    <div className="text-right"><div className="text-[11px] font-bold">{g.price}</div><button onClick={() => acquire(g)} className="mt-1 rounded bg-[#0074e4] px-3 py-1 text-[9px] font-bold hover:bg-[#1084f4]">{g.owned ? 'PLAY' : 'GET'}</button></div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[9px] text-white/30">Install size: Nebula Strike {installSize} · D:\\Games\\Epic</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RailBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`relative rounded-lg p-2.5 transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white hover:bg-white/5'}`} title={label} aria-label={label}>
      {children}
      {active && <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded bg-[#0074e4]" />}
    </button>
  );
}
