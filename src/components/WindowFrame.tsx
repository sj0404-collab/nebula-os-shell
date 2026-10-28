import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Minus, Square, Copy } from 'lucide-react';
import { useOS, type WinState } from '../lib/os';
import { AppIcon } from './icons';
import EdgeApp from './apps/EdgeApp';
import NebulaApp from './apps/NebulaApp';
import SteamApp from './apps/SteamApp';
import EpicApp from './apps/EpicApp';
import TerminalApp from './apps/TerminalApp';
import OpencodeApp from './apps/OpencodeApp';
import ExplorerApp from './apps/ExplorerApp';
import NotepadApp from './apps/NotepadApp';
import SettingsApp from './apps/SettingsApp';
import DownloadsApp from './apps/DownloadsApp';

const appContent: Record<string, React.ComponentType<{ win: WinState }>> = {
  edge: EdgeApp,
  nebula: NebulaApp,
  steam: SteamApp,
  epic: EpicApp,
  terminal: TerminalApp,
  opencode: OpencodeApp,
  explorer: ExplorerApp,
  notepad: NotepadApp,
  settings: SettingsApp,
  downloads: DownloadsApp,
};

export default function WindowFrame({ win }: { win: WinState }) {
  const { closeWindow, toggleMinimize, toggleMaximize, focusWindow, moveWindow, resizeWindow } = useOS();
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resizing = useRef<{ sw: number; sh: number; sx: number; sy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (win.maximized) return;
    if ((e.target as HTMLElement).closest('.win-btn')) return;
    drag.current = { dx: e.clientX - win.pos.x, dy: e.clientY - win.pos.y };
    setDragging(true);
    focusWindow(win.id);
    e.preventDefault();
  }, [win.maximized, win.pos.x, win.pos.y, win.id, focusWindow]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const nx = Math.max(-win.size.w + 120, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy));
      moveWindow(win.id, { x: nx, y: ny });
    };
    const up = () => { setDragging(false); drag.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging, win.id, win.size.w, moveWindow]);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (win.maximized) return;
    resizing.current = { sw: win.size.w, sh: win.size.h, sx: e.clientX, sy: e.clientY };
    focusWindow(win.id);
    e.preventDefault(); e.stopPropagation();
  }, [win.maximized, win.size.w, win.size.h, win.id, focusWindow]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!resizing.current) return;
      const w = Math.max(420, resizing.current.sw + (e.clientX - resizing.current.sx));
      const h = Math.max(300, resizing.current.sh + (e.clientY - resizing.current.sy));
      resizeWindow(win.id, { w, h });
    };
    const up = () => { resizing.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [win.id, resizeWindow]);

  const Content = appContent[win.app];
  if (win.minimized) return null;

  const style: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100vw', height: 'calc(100vh - 48px)', zIndex: win.z }
    : { left: win.pos.x, top: win.pos.y, width: win.size.w, height: win.size.h, zIndex: win.z };

  return (
    <div
      className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-[8px] border border-black/60 shadow-[0_18px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)_inset] bg-[#202020] select-none"
      style={style}
      onMouseDown={() => focusWindow(win.id)}
      role="dialog"
      aria-label={win.title}
    >
      {/* Title bar */}
      <div
        className="flex h-9 shrink-0 items-center bg-[#2d2d2d] text-[12px] text-[#e8e8e8] cursor-default"
        onMouseDown={onTitleMouseDown}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <AppIcon id={win.icon} size={14} className="ml-3 mr-2 opacity-90" />
        <span className="truncate flex-1 pr-2">{win.title}</span>
        <button className="win-btn h-9 w-11 grid place-items-center hover:bg-white/10 transition-colors" onClick={() => toggleMinimize(win.id)} aria-label="Minimize">
          <Minus size={15} strokeWidth={1.5} />
        </button>
        <button className="win-btn h-9 w-11 grid place-items-center hover:bg-white/10 transition-colors" onClick={() => toggleMaximize(win.id)} aria-label="Maximize">
          {win.maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
        </button>
        <button className="win-btn h-9 w-11 grid place-items-center hover:bg-[#e81123] hover:text-white transition-colors rounded-tr-[8px]" onClick={() => closeWindow(win.id)} aria-label="Close">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#1f1f1f]">
        {Content ? <Content win={win} /> : null}
      </div>
      {/* Resize handle */}
      {!win.maximized && (
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize z-10"
          onMouseDown={onResizeMouseDown}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className="h-full w-full opacity-50"><path d="M14 2 L2 14 M14 7 L7 14 M14 12 L12 14" stroke="#888" strokeWidth="1.2" fill="none"/></svg>
        </div>
      )}
    </div>
  );
}
