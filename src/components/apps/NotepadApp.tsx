import { useState } from 'react';
import { useOS } from '../../lib/os';
import { Save, FilePlus, X } from 'lucide-react';

export default function NotepadApp() {
  const { saveFile, pushToast } = useOS();
  const [title] = useState('document.txt');
  const [text, setText] = useState(
    'NEBULA STRIKE — Big Pickle Studios\n' +
    '================================\n\n' +
    'Native build artifacts verified today on this machine:\n\n' +
    '  NebulaStrike.exe           234,496 bytes  PE32+ x86-64  [WIN32]\n' +
    '  nebula_strike_wasm64.wasm   25,191 bytes  memory64      [WASM64]\n' +
    '  nebula_strike_wasm32.wasm 1,054,237 bytes  WASI p1       [WASM32]\n\n' +
    'Headless autotest (seed 1337, AI pilot):\n' +
    '  wasm32: WIN / 7500 / wave 5/5 / 2563 frames / 3 lives\n' +
    '  wasm64: WIN / 7500 / wave 5/5 / 2563 frames / 3 lives (bit-identical)\n\n' +
    'Logic benchmark (60 sim-seconds):\n' +
    '  wasm64: ~1,745,405 logic fps\n' +
    '  wasm32: ~1,285,714 logic fps\n\n' +
    'Source: NebulaStrike_BigPickle_Source.zip (34 files)\n' +
    'Hosted: gofile.io/d/CFLGWxGq\n'
  );
  const [dirty, setDirty] = useState(false);

  const save = () => {
    saveFile(['C:', 'Users', 'BigPickle', 'Documents'], title, text);
    setDirty(false);
    pushToast('Notepad', `${title} saved to Documents`, 'notepad');
  };

  return (
    <div className="flex h-full flex-col bg-white text-[#1b1b1b]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 bg-[#f3f3f3] px-2 text-[11px] text-slate-600">
        <span className="font-semibold">File</span><span className="font-semibold">Edit</span><span className="font-semibold">Format</span><span className="font-semibold">View</span><span className="font-semibold">Help</span>
        <button onClick={() => { setText(''); setDirty(true); }} title="New file" className="ml-2 rounded p-1.5 hover:bg-slate-200"><FilePlus size={14} /></button>
        <button onClick={save} title="Save (Ctrl+S)" className="rounded p-1.5 hover:bg-slate-200"><Save size={14} /></button>
        <span className="ml-auto text-[10px] text-slate-400">{dirty ? '● unsaved' : 'saved'} · UTF-8</span>
      </div>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setDirty(true); }}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }}
        className="flex-1 min-h-0 resize-none bg-white p-3 font-mono text-[12px] leading-relaxed outline-none"
        spellCheck={false}
        autoFocus
      />
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-slate-200 bg-[#f3f3f3] px-3 text-[10px] text-slate-500">
        <span>Ln {text.split('\n').length}, Col {text.length}</span>
        <span className="flex items-center gap-2"><X size={10} /> {title} · Notepad · Windows 10</span>
      </div>
    </div>
  );
}
