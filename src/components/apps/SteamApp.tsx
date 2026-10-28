import { useState } from 'react';
import { useOS } from '../../lib/os';
import { AppIcon } from '../icons';
import { Home, Library, Users, MessageSquare, Settings, Download, Check, ShoppingCart, Play, Monitor, HardDrive, Wifi } from 'lucide-react';

type Nav = 'store' | 'library' | 'community' | 'messages';

export default function SteamApp() {
  const { openApp, pushToast } = useOS();
  const [nav, setNav] = useState<Nav>('library');
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(true); // ships preinstalled on this PC
  const [progress, setProgress] = useState(100);

  const install = () => {
    setInstalling(true); setProgress(0);
    const t = window.setInterval(() => {
      setProgress(p => {
        if (p >= 100) { window.clearInterval(t); setInstalling(false); setInstalled(true); pushToast('Steam', 'Nebula Strike installed to C:\\Program Files\\Big Pickle Studios\\NebulaStrike', 'game'); return 100; }
        return p + Math.random() * 14;
      });
    }, 120);
  };

  const navItem = (id: Nav, icon: React.ReactNode, label: string) => (
    <button onClick={() => setNav(id)} className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[12px] transition-colors ${nav === id ? 'bg-[#3d4450] text-white' : 'text-[#b8b6b4] hover:text-white hover:bg-[#2a2f38]'}`}>
      {icon}<span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-full bg-[#1b2838] text-[#c7d5e0]">
      {/* sidebar */}
      <div className="w-48 shrink-0 flex flex-col bg-[#171a21] border-r border-black/40 p-2 gap-0.5">
        <div className="flex items-center gap-2 px-2 py-2 mb-1">
          <AppIcon id="steam" size={26} />
          <div><div className="text-[13px] font-bold text-white leading-none">STEAM</div><div className="text-[9px] text-[#66c0f4]">BigPickle (Online)</div></div>
        </div>
        {navItem('store', <Home size={14} />, 'Store')}
        {navItem('library', <Library size={14} />, 'Library')}
        {navItem('community', <Users size={14} />, 'Community')}
        {navItem('messages', <MessageSquare size={14} />, 'Messages')}
        <div className="mt-auto border-t border-white/10 pt-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-[#66c0f4]"><Wifi size={12} /> Online · 34 ms</div>
          <button className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-[#c7d5e0] hover:text-white w-full"><Settings size={13} /> Settings</button>
        </div>
      </div>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {nav === 'library' && (
          <div className="flex flex-1 min-h-0">
            {/* game list */}
            <div className="w-44 shrink-0 border-r border-black/40 overflow-y-auto p-2">
              <div className="text-[9px] tracking-widest text-[#66c0f4] px-2 py-1">GAMES (2)</div>
              {['Nebula Strike', 'Big Pickle: Depot Sim'].map(g => (
                <div key={g} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[11px] cursor-pointer ${g === 'Nebula Strike' ? 'bg-[#3d6a8f] text-white' : 'hover:bg-[#232b36]'}`}>
                  <AppIcon id="game" size={20} /><span className="truncate">{g}</span>
                </div>
              ))}
            </div>
            {/* hero */}
            <div className="relative flex-1 min-w-0 flex flex-col">
              <img src="/assets/game-capsule.jpg" alt="Nebula Strike" className="absolute inset-0 h-full w-full object-cover object-center opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1b2838] via-[#1b283855] to-transparent" />
              <div className="relative mt-auto p-6">
                <div className="text-[10px] tracking-widest text-[#66c0f4] font-bold">BIG PICKLE STUDIOS · ACTION</div>
                <h1 className="text-4xl font-black text-white drop-shadow">NEBULA STRIKE</h1>
                <div className="mt-3 flex items-center gap-3">
                  {installed && !installing ? (
                    <button onClick={() => openApp('nebula')} className="flex items-center gap-2 rounded-[3px] bg-gradient-to-b from-[#8bc53f] to-[#5c9a2a] px-8 py-2.5 text-lg font-black text-[#173300] shadow-[0_2px_0_#3c6b1c] hover:brightness-110 active:translate-y-[1px]">
                      <Play size={18} fill="currentColor" /> PLAY
                    </button>
                  ) : (
                    <button onClick={install} className="flex items-center gap-2 rounded-[3px] bg-gradient-to-b from-[#47b5ff] to-[#1a73c9] px-8 py-2.5 text-base font-bold text-[#062033] hover:brightness-110">
                      <Download size={16} /> {installing ? `DOWNLOADING… ${Math.min(99, Math.floor(progress))}%` : 'INSTALL'}
                    </button>
                  )}
                  {installed && !installing && (
                    <button onClick={() => { setInstalled(false); setProgress(0); }} className="rounded-[3px] bg-white/10 px-4 py-2 text-[11px] text-slate-200 hover:bg-white/20">Uninstall</button>
                  )}
                </div>
                {installing && (
                  <div className="mt-3 h-2 w-72 overflow-hidden rounded-full bg-black/60">
                    <div className="h-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
                  </div>
                )}
                <div className="mt-4 flex items-center gap-4 text-[10px] text-[#9fb5c4]">
                  <span className="flex items-center gap-1"><Monitor size={11} /> Windows 10/11 64-bit</span>
                  <span className="flex items-center gap-1"><HardDrive size={11} /> 234 KB · SSD</span>
                  <span className="flex items-center gap-1"><Check size={11} className="text-emerald-400" /> Up to date (build 1.0.0)</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {nav === 'store' && (
          <div className="flex-1 overflow-y-auto">
            <div className="relative h-44">
              <img src="/assets/game-capsule.jpg" alt="Nebula Strike capsule" className="absolute inset-0 h-full w-full object-cover object-[70%_25%]" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#1b2838] via-transparent to-transparent" />
              <div className="relative p-5"><div className="text-[9px] text-[#66c0f4] font-bold">SPOTLIGHT</div><h2 className="text-3xl font-black">Nebula Strike</h2><button onClick={() => setNav('library')} className="mt-2 rounded bg-[#66c0f4] px-4 py-1.5 text-[11px] font-bold text-[#062033]">View in Library</button></div>
            </div>
            <div className="p-5 grid grid-cols-3 gap-3">
              {[{ n: 'Nebula Strike', p: 'Free', tag: 'NEW' }, { n: 'Big Pickle: Depot Sim', p: '$9.99', tag: '' }, { n: 'WASM64 Racer', p: '$4.99', tag: 'EARLY ACCESS' }].map(g => (
                <div key={g.n} className="rounded overflow-hidden border border-white/10 bg-[#232b36]">
                  <img src="/assets/game-capsule.jpg" alt={g.n} className="h-24 w-full object-cover" loading="lazy" />
                  <div className="p-2"><div className="text-[11px] font-bold text-white truncate">{g.n}</div><div className="mt-1 flex items-center justify-between"><span className="text-[10px] text-[#66c0f4]">{g.tag}</span><span className="text-[10px] font-bold">{g.p}</span></div></div>
                </div>
              ))}
            </div>
          </div>
        )}
        {nav === 'community' && (
          <div className="flex-1 overflow-y-auto p-5 text-[12px]">
            <h2 className="text-lg font-bold text-white mb-3">Community Hub — Nebula Strike</h2>
            {['BigPickle: "Autotest flawless victory — WIN 7500pts on seed 1337. Ship it."', 'wasm_wizard: "He runs the whole game in WASM64. pointer_bits = 64. This is the way."', 'speedrunner_42: "Any% WR 42.6s. GG Big Pickle."'].map((p, i) => (
              <div key={i} className="mb-2 rounded border border-white/10 bg-[#232b36] p-3"><span className="text-[#66c0f4]">● </span>{p}</div>
            ))}
          </div>
        )}
        {nav === 'messages' && (
          <div className="flex-1 flex flex-col p-5">
            <h2 className="text-lg font-bold text-white mb-2">Messages</h2>
            <div className="flex-1 rounded border border-white/10 bg-[#232b36] p-3 text-[12px]">
              <div className="text-[#66c0f4] font-bold">Nebula Strike Official</div>
              <p className="mt-1 text-[#c7d5e0]">Welcome, BigPickle! Nebula Strike 1.0 is live. Launch from your Library and good hunting, pilot.</p>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#8a94a0]"><ShoppingCart size={11} /> Receipt stored · Funds: Big Pickle Studios Publishing</div>
          </div>
        )}
      </div>
    </div>
  );
}
