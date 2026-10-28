import { useEffect, useState } from 'react';
import { OSProvider, useOS } from './lib/os';
import Desktop from './components/Desktop';
import Taskbar from './components/Taskbar';
import StartMenu from './components/StartMenu';
import WindowFrame from './components/WindowFrame';
import { AnimatePresence, motion } from 'framer-motion';
import { WindowsLogo } from './components/icons';
import { X } from 'lucide-react';
import './App.css';

function ToastLayer() {
  const { toasts, dismissToast } = useOS();
  return (
    <div className="pointer-events-none absolute bottom-14 right-3 z-[10050] flex w-80 flex-col gap-2">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-white/15 bg-[#242424]/95 backdrop-blur-md p-3 shadow-2xl"
          >
            <WindowsLogo size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 text-[11px]">
              <div className="font-semibold text-white/95">{t.title}</div>
              <div className="text-white/70 leading-snug">{t.body}</div>
            </div>
            <button onClick={() => dismissToast(t.id)} className="rounded p-1 hover:bg-white/10"><X size={12} className="text-white/60" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function WindowsLayer() {
  const { windows } = useOS();
  return (
    <div className="pointer-events-none absolute inset-0 z-[100]">
      {windows.map(w => <WindowFrame key={w.id} win={w} />)}
    </div>
  );
}

function BootScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'bios' | 'spinner' | 'logo'>('bios');
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('logo'), 1400);
    const t2 = window.setTimeout(onDone, 3400);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className="absolute inset-0 z-[20000] bg-black flex flex-col">
      {phase === 'bios' ? (
        <div className="p-6 font-mono text-[13px] leading-6 text-[#c7c7c7]">
          <div className="text-white">American Megatrends — BIOS v4.21</div>
          <div>CPU: AMD Ryzen 9 7950X3D · 16 Cores @ 5.70GHz</div>
          <div>Memory: 65536 MB OK</div>
          <div>Primary Master: Samsung SSD 990 PRO 2TB</div>
          <div>WASM64: memory64 enabled · wasm32-wasi: OK</div>
          <div>Press <span className="text-white">DEL</span> to enter SETUP, <span className="text-white">F12</span> for Boot Menu</div>
          <div className="mt-3 text-[#8a8a8a]">Booting from C:\…</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <WindowsLogo size={96} />
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-white/80 animate-ping" style={{ animationDelay: `${i * 0.12}s`, animationDuration: '1.1s' }} />
            ))}
          </div>
          <div className="text-[12px] text-white/60 tracking-wide">Windows</div>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const [booted, setBooted] = useState(() => {
    try { return sessionStorage.getItem('win10-booted') === '1'; } catch { return false; }
  });
  const handleBootDone = () => {
    try { sessionStorage.setItem('win10-booted', '1'); } catch { /* noop */ }
    setBooted(true);
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black font-sans select-none">
      <Desktop />
      <WindowsLayer />
      <StartMenu />
      <Taskbar />
      <ToastLayer />
      {!booted && <BootScreen onDone={handleBootDone} />}
    </div>
  );
}

export default function App() {
  return (
    <OSProvider>
      <Shell />
    </OSProvider>
  );
}
