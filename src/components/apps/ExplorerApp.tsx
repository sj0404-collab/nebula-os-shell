import { useEffect, useMemo, useState } from 'react';
import { useOS, type FsNode } from '../../lib/os';
import { AppIcon } from '../icons';
import { ChevronRight, ChevronDown, Monitor, Download, RotateCw, Search, ArrowLeft, ArrowRight, Home, File as FileIcon, Folder, List, LayoutGrid, HardDrive } from 'lucide-react';

const QUICK: { label: string; path: string[] }[] = [
  { label: 'Desktop', path: ['C:', 'Users', 'BigPickle', 'Desktop'] },
  { label: 'Downloads', path: ['C:', 'Users', 'BigPickle', 'Downloads'] },
  { label: 'Documents', path: ['C:', 'Users', 'BigPickle', 'Documents'] },
  { label: 'This PC', path: ['C:'] },
];

function findDir(root: FsNode, path: string[]): FsNode | null {
  let cur: FsNode = root;
  for (const seg of path.slice(1)) {
    const next = cur.children?.find(c => c.name.toLowerCase() === seg.toLowerCase());
    if (!next) return null;
    cur = next;
  }
  return cur;
}

export default function ExplorerApp() {
  const { fs, openApp, pushToast } = useOS();
  const [path, setPath] = useState<string[]>(['C:', 'Users', 'BigPickle', 'Downloads']);
  const [history, setHistory] = useState<string[][]>([]);
  const [future, setFuture] = useState<string[][]>([]);
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [query, setQuery] = useState('');
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 720));
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth > 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const dir = findDir(fs, path);
  const items = useMemo(() => (dir?.children ?? []).filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase())), [dir, query]);

  const navigate = (p: string[]) => {
    setHistory(h => [...h, path]); setFuture([]); setPath(p); setQuery('');
  };
  const back = () => { if (history.length) { setFuture(f => [path, ...f]); setPath(history[history.length - 1]); setHistory(h => h.slice(0, -1)); } };
  const fwd = () => { if (future.length) { setHistory(h => [...h, path]); setPath(future[0]); setFuture(f => f.slice(1)); } };
  const up = () => { if (path.length > 1) { setHistory(h => [...h, path]); setFuture([]); setPath(path.slice(0, -1)); } };

  const open = (node: FsNode) => {
    if (node.type === 'dir') navigate([...path, node.name]);
    else if (/\.wasm$|\.exe$/i.test(node.name)) { window.location.assign(`/downloads/${node.name}`); pushToast('Downloads', `Streaming ${node.name}…`, 'downloads'); }
    else if (/\.lnk$/i.test(node.name)) openApp('nebula');
    else openApp('notepad');
  };

  const crumbs = ['C:', ...path.slice(1)];

  return (
    <div className="flex h-full bg-white text-[#1b1b1b] text-[12px]">
      {/* nav pane */}
      <div className={`${wide ? 'w-44' : 'w-12'} shrink-0 border-r border-slate-200 bg-[#f7f7f7] py-2 overflow-y-auto`}>
        <div className="px-3 py-1 text-[10px] font-bold text-slate-500 tracking-wider">{wide && 'Quick access'}</div>
        {QUICK.map(q => (
          <button key={q.label} onClick={() => navigate(q.path)} title={q.label}
            className={`flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-200 ${JSON.stringify(q.path) === JSON.stringify(path) ? 'bg-sky-100 text-sky-800' : ''}`}>
            {q.label === 'This PC' ? <Monitor size={14} className="text-slate-600 shrink-0" /> : <Folder size={14} className="text-amber-500 shrink-0" fill="#fcd34d" />}
            {wide && <span className="truncate">{q.label}</span>}
          </button>
        ))}
        <div className="px-3 py-1 mt-2 text-[10px] font-bold text-slate-500 tracking-wider">{wide && 'This PC'}</div>
        <div className="flex items-center gap-2 px-3 py-1.5 text-slate-600">{wide ? <><HardDrive size={13} /><span>Local Disk (C:) · 118 GB free of 237 GB</span></> : <HardDrive size={13} />}</div>
      </div>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* toolbar */}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 px-2">
          <button onClick={back} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={!history.length}><ArrowLeft size={15} /></button>
          <button onClick={fwd} className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30" disabled={!future.length}><ArrowRight size={15} /></button>
          <button onClick={up} className="rounded p-1.5 hover:bg-slate-100"><ChevronRight size={15} className="-rotate-90" /></button>
          <button onClick={() => navigate(['C:'])} className="rounded p-1.5 hover:bg-slate-100"><Home size={15} /></button>
          <button onClick={() => setPath([...path])} className="rounded p-1.5 hover:bg-slate-100"><RotateCw size={14} /></button>
          <form className="ml-1 flex w-48 items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-2 py-1 focus-within:border-sky-500" onSubmit={e => e.preventDefault()}>
            <Search size={12} className="text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${path[path.length - 1]}`} className="w-full bg-transparent text-[11px] outline-none" spellCheck={false} />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('list')} className={`rounded p-1.5 ${view === 'list' ? 'bg-sky-100 text-sky-700' : 'hover:bg-slate-100'}`}><List size={15} /></button>
            <button onClick={() => setView('grid')} className={`rounded p-1.5 ${view === 'grid' ? 'bg-sky-100 text-sky-700' : 'hover:bg-slate-100'}`}><LayoutGrid size={15} /></button>
          </div>
        </div>
        {/* breadcrumb */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-600 overflow-x-auto whitespace-nowrap">
          <Monitor size={12} className="mr-1 text-slate-400 shrink-0" />
          {crumbs.map((seg, i) => (
            <span key={i} className="flex items-center">
              <button className="rounded px-1 py-0.5 hover:bg-slate-200 hover:text-slate-900" onClick={() => navigate(path.slice(0, i + 1))}>{seg}</button>
              {i < crumbs.length - 1 && <ChevronRight size={11} className="text-slate-400" />}
            </span>
          ))}
        </div>
        {/* items */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {items.length === 0 && <div className="mt-8 text-center text-slate-400">{query ? `No items matching "${query}"` : 'This folder is empty.'}</div>}
          {view === 'grid' ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {items.map(node => (
                <button key={node.name} onDoubleClick={() => open(node)} onClick={() => node.type === 'dir' ? undefined : undefined} className="group flex flex-col items-center gap-1.5 rounded-md p-2 hover:bg-sky-50 focus:bg-sky-100 outline-none" onFocus={() => undefined}>
                  <ItemIcon node={node} size={40} />
                  <span className="w-full truncate text-center text-[10px] leading-tight">{node.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-slate-500"><th className="py-1">Name</th><th>Type</th><th>Size</th></tr></thead>
              <tbody>
                {items.map(node => (
                  <tr key={node.name} onDoubleClick={() => open(node)} className="cursor-default border-t border-slate-100 hover:bg-sky-50">
                    <td className="flex items-center gap-2 py-1"><ItemIcon node={node} size={16} /><span className="truncate">{node.name}</span></td>
                    <td className="text-slate-500">{node.type === 'dir' ? 'File folder' : extOf(node.name)}</td>
                    <td className="text-slate-500">{node.type === 'dir' ? '' : fmtSize(node.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* status bar */}
        <div className="flex h-6 shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 text-[10px] text-slate-500">
          <span>{items.length} item(s)</span>
          <span>|</span>
          <span>{dir?.children?.filter(c => c.type === 'file').reduce((a, c) => a + (c.size ?? 0), 0).toLocaleString()} bytes</span>
          <span className="ml-auto flex items-center gap-1"><ChevronDown size={10} /> This PC</span>
        </div>
      </div>
    </div>
  );
}

function ItemIcon({ node, size }: { node: FsNode; size: number }) {
  if (node.type === 'dir') return <Folder size={size} className="text-amber-400" fill="#fcd34d" strokeWidth={1.4} />;
  const n = node.name.toLowerCase();
  if (n.endsWith('.exe')) return <AppIcon id="game" size={size} />;
  if (n.endsWith('.wasm')) return <AppIcon id="webgl" size={size} />;
  if (n.endsWith('.zip')) return <Download size={size} className="text-sky-600" strokeWidth={1.6} />;
  if (n.endsWith('.lnk')) return <AppIcon id="game" size={size} />;
  if (n.endsWith('.md') || n.endsWith('.txt') || n.endsWith('.bat') || n.endsWith('.sh')) return <FileIcon size={size} className="text-slate-400" strokeWidth={1.4} />;
  return <FileIcon size={size} className="text-slate-400" strokeWidth={1.4} />;
}

const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase() + ' File' : 'File';
};
const fmtSize = (s?: number) => !s ? '' : s < 1024 ? `${s} B` : s < 1048576 ? `${(s / 1024).toFixed(1)} KB` : `${(s / 1048576).toFixed(1)} MB`;
