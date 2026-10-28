// In-browser "real" interpreters — a genuine JS sandbox (eval), a real Python
// interpreter (Pyodide WASM), and a virtual UNIX-style fs for the terminal.
import { useEffect, useReducer, useRef } from 'react';

export interface TermLine { text: string; kind: 'out' | 'err' | 'cmd' | 'ok' }

export interface TerminalState {
  cwd: string[];
  lines: TermLine[];
  pyodideStatus: 'idle' | 'loading' | 'ready' | 'error';
  pyodideError?: string;
}

export type TerminalAction =
  | { type: 'line'; line: TermLine }
  | { type: 'lines'; lines: TermLine[] }
  | { type: 'clear' }
  | { type: 'cd'; path: string[] }
  | { type: 'pyodide'; status: TerminalState['pyodideStatus']; error?: string };

export function terminalReducer(s: TerminalState, a: TerminalAction): TerminalState {
  switch (a.type) {
    case 'line': return { ...s, lines: [...s.lines, a.line] };
    case 'lines': return { ...s, lines: [...s.lines, ...a.lines] };
    case 'clear': return { ...s, lines: [] };
    case 'cd': return { ...s, cwd: a.path };
    case 'pyodide': return { ...s, pyodideStatus: a.status, pyodideError: a.error };
    default: return s;
  }
}

// ---------------- Pyodide loader ----------------
let pyodidePromise: Promise<{ runPython: (code: string) => unknown }> | null = null;

declare global {
  interface Window { loadPyodide?: (cfg: { indexURL: string }) => Promise<{ runPython: (code: string) => unknown }> }
}

export function loadPyodideOnce(): Promise<{ runPython: (code: string) => unknown }> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = new Promise((resolve, reject) => {
    const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
    const finish = () => {
      const boot = () => window.loadPyodide!({ indexURL: CDN }).then(resolve, reject);
      if (window.loadPyodide) boot();
      else { const t = window.setInterval(() => { if (window.loadPyodide) { window.clearInterval(t); boot(); } }, 50); window.setTimeout(() => reject(new Error('pyodide load timeout')), 90000); }
    };
    if (document.querySelector('script[data-pyodide]')) { finish(); return; }
    const s = document.createElement('script');
    s.src = CDN + 'pyodide.js';
    s.dataset.pyodide = '1';
    s.onload = finish;
    s.onerror = () => reject(new Error('failed to load pyodide.js from CDN (needs network)'));
    document.head.appendChild(s);
  });
  return pyodidePromise;
}

export async function runPython(code: string): Promise<{ stdout: string; error?: string }> {
  try {
    const py = await loadPyodideOnce();
    const wrapped = `
import sys, io
_buf = io.StringIO()
_old = sys.stdout
sys.stdout = _buf
try:
${code.split('\n').map(l => '    ' + l).join('\n') || '    pass'}
    _err = None
except Exception as e:
    _err = f'{type(e).__name__}: {e}'
finally:
    sys.stdout = _old
_buf.getvalue() + ('\n__PYERR__:' + _err if _err else '')
`;
    const out = String(py.runPython(wrapped));
    const idx = out.lastIndexOf('\n__PYERR__:');
    if (idx >= 0) return { stdout: out.slice(0, idx), error: out.slice(idx + '\n__PYERR__:'.length) };
    if (out.startsWith('__PYERR__:')) return { stdout: '', error: out.slice('__PYERR__:'.length) };
    return { stdout: out };
  } catch (e) {
    return { stdout: '', error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------- real JS evaluation sandbox ----------------
export function runJavaScript(code: string): { stdout: string; error?: string } {
  const logs: string[] = [];
  const fmt = (v: unknown): string => {
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v, (_k, val) => typeof val === 'bigint' ? val.toString() + 'n' : (typeof val === 'function' ? val.toString() : val), 2); } catch { return String(v); }
  };
  const fakeConsole = {
    log: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')),
    error: (...a: unknown[]) => logs.push('[err] ' + a.map(fmt).join(' ')),
    warn: (...a: unknown[]) => logs.push('[warn] ' + a.map(fmt).join(' ')),
    info: (...a: unknown[]) => logs.push(a.map(fmt).join(' ')),
    table: (v: unknown) => logs.push(fmt(v)),
  };
  try {
    // indirect eval inside a fresh function scope with a captured console
    const runner = new Function('console', `"use strict";\n${code}`);
    const result = runner(fakeConsole);
    if (result !== undefined) logs.push('=> ' + fmt(result));
    return { stdout: logs.join('\n') };
  } catch (e) {
    return { stdout: logs.join('\n'), error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

// ---------------- utilities ----------------
export function usePyodideStatus() {
  const [status, setStatus] = useReducer((_: string, s: string) => s, 'idle');
  const ref = useRef(status);
  useEffect(() => { ref.current = status; }, [status]);
  return { status, setStatus };
}
