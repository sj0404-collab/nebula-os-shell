import { AppIcon } from '../icons';
import { Download, FileArchive, File as FileIcon, ExternalLink, BadgeCheck } from 'lucide-react';

const FILES = [
  { name: 'NebulaStrike.exe', desc: 'Native Windows 10/11 x64 binary — Win32 GDI, zero dependencies', size: '234,496 bytes', href: '/downloads/NebulaStrike.exe', icon: 'game' },
  { name: 'nebula_strike_wasm64.wasm', desc: 'True 64-bit WASM (memory64) — 64-bit pointers & size_t, runs in this browser', size: '25,191 bytes', href: '/downloads/nebula_strike_wasm64.wasm', icon: 'webgl' },
  { name: 'nebula_strike_wasm32.wasm', desc: '32-bit WASM + WASI preview1 — deterministic autotest & benchmark', size: '1,054,237 bytes', href: '/downloads/nebula_strike_wasm32.wasm', icon: 'webgl' },
  { name: 'NebulaStrike_BigPickle_Source.zip', desc: 'Full source: C game core, Windows/WASM wrappers, OS shell (React+TS), build scripts', size: '5,111,037 bytes', href: '/downloads/NebulaStrike_BigPickle_Source.zip', icon: 'zip' },
  { name: 'NebulaStrike.pdb', desc: 'Debug symbols for NebulaStrike.exe', size: '1,224,704 bytes', href: '/downloads/NebulaStrike.pdb', icon: 'zip' },
  { name: 'test_results.json', desc: 'Headless autotest & benchmark results (both WASM builds, bit-identical)', size: '926 bytes', href: '/downloads/test_results.json', icon: 'zip' },
];

const GOFILE = [
  { label: 'Nebula Strike — full source ZIP (gofile.io)', href: 'https://gofile.io/d/CFLGWxGq' },
  { label: 'NebulaStrike.exe (gofile.io)', href: 'https://gofile.io/d/hmtAKBIg' },
];

export default function DownloadsApp() {
  return (
    <div className="flex h-full flex-col bg-white text-[#1b1b1b] text-[12px]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-200 bg-[#f3f3f3] px-4">
        <Download size={15} className="text-sky-600" />
        <span className="font-semibold">Downloads</span>
        <span className="ml-2 text-[10px] text-slate-400">C:\\Users\\BigPickle\\Downloads</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {FILES.map(f => (
            <a key={f.name} href={f.href} download className="group flex items-start gap-3 rounded-lg border border-slate-200 p-3 transition-all hover:border-sky-400 hover:shadow-md">
              {f.icon === 'zip'
                ? <FileArchive size={34} className="shrink-0 text-amber-500" strokeWidth={1.5} />
                : <AppIcon id={f.icon} size={36} className="shrink-0" />}
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold group-hover:text-sky-700">{f.name}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{f.desc}</span>
                <span className="mt-1 block text-[9px] font-mono text-slate-400">{f.size}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800"><BadgeCheck size={13} /> gofile.io mirrors</div>
          <div className="mt-1.5 space-y-1">
            {GOFILE.map(g => (
              <a key={g.href} href={g.href} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] text-emerald-800 hover:underline"><ExternalLink size={11} />{g.label}</a>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[10px] text-slate-400 flex items-center gap-1"><FileIcon size={10} />All artifacts built from source with zig cc 0.17.0 — reproducible, checksum-pinned in test_results.json.</p>
      </div>
    </div>
  );
}
