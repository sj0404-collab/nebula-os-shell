import { useEffect, useRef, useState } from 'react';
import { useOS } from '../../lib/os';
import { NebulaGame, W, H } from '../../lib/nebula';
import { NebulaWasm64 } from '../../lib/memory64';
import { NebulaGL, type GLInfo } from '../../lib/webgl';
import { RotateCcw, Download, Gauge, Cpu, Zap } from 'lucide-react';

// Unified snapshot shape for rendering
interface Snapshot {
  engine: 'wasm64' | 'ts';
  shipX: number; shake: number; gameOver: boolean; win: boolean;
  score: number; lives: number; wave: number;
  stars: { x: number; y: number; vy: number }[];
  bolts: { x: number; y: number }[];
  enemies: { x: number; y: number; r: number; hp: number }[];
  parts: { x: number; y: number; life: number }[];
}

const SHIP_Y = H - 70;

function drawScene(ctx: CanvasRenderingContext2D, s: Snapshot, time: number) {
  ctx.save();
  // camera shake
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);

  // background — deep space + nebula glow (drawn fresh each frame for WebGL-style richness)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#04061a'); g.addColorStop(1, '#0e1632');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const neb1 = ctx.createRadialGradient(180, 110, 10, 180, 110, 175);
  neb1.addColorStop(0, 'rgba(150,70,160,0.5)'); neb1.addColorStop(1, 'rgba(150,70,160,0)');
  ctx.fillStyle = neb1; ctx.fillRect(0, 0, W, H);
  const neb2 = ctx.createRadialGradient(620, 330, 10, 620, 330, 210);
  neb2.addColorStop(0, 'rgba(60,140,220,0.5)'); neb2.addColorStop(1, 'rgba(60,140,220,0)');
  ctx.fillStyle = neb2; ctx.fillRect(0, 0, W, H);

  // stars
  for (const star of s.stars) {
    const b = Math.floor(140 + star.vy * 60);
    ctx.fillStyle = `rgb(${b},${b},${b})`;
    ctx.fillRect(star.x, star.y, 2, 2);
    if (star.vy > 1.4) ctx.fillRect(star.x, star.y + 4, 2, 5);
  }

  // particles
  for (const p of s.parts) {
    const a = Math.max(0, Math.min(1, p.life / 60));
    ctx.fillStyle = `rgba(255,${Math.floor(160 * a)},${Math.floor(60 * a)},${a})`;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }

  // bolts — glowing plasma
  for (const b of s.bolts) {
    ctx.shadowColor = '#59f2ff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#baf6ff';
    ctx.fillRect(b.x - 2, b.y - 7, 4, 12);
    ctx.shadowBlur = 0;
  }

  // enemies — glyph fighters
  for (const e of s.enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#d63c46';
    ctx.beginPath();
    ctx.moveTo(0, e.r); ctx.lineTo(-e.r, -e.r / 2); ctx.lineTo(-e.r / 2, -e.r);
    ctx.lineTo(0, -e.r / 2); ctx.lineTo(e.r / 2, -e.r); ctx.lineTo(e.r, -e.r / 2);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,130,130,0.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ship
  if (!s.gameOver || s.lives > 0) {
    ctx.save();
    ctx.translate(s.shipX, SHIP_Y);
    ctx.shadowColor = '#46b4ff'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#46b4ff';
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(-18, 16); ctx.lineTo(-8, 8); ctx.lineTo(0, 14); ctx.lineTo(8, 8); ctx.lineTo(18, 16);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#b4f0ff';
    ctx.beginPath(); ctx.ellipse(0, -4, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
    // engine flame
    const fl = 8 + Math.sin(time * 0.02) * 3 + Math.random() * 3;
    ctx.fillStyle = '#ffa028';
    ctx.beginPath(); ctx.moveTo(-5, 16); ctx.lineTo(5, 16); ctx.lineTo(0, 16 + fl + 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore(); // end shake

  // HUD
  ctx.fillStyle = 'rgba(10,16,36,0.72)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillRect(0, H - 30, W, 30);
  ctx.fillStyle = '#96e6ff';
  ctx.font = 'bold 15px Consolas, monospace';
  ctx.fillText(`SCORE ${String(s.score).padStart(6, '0')}   WAVE ${s.wave}/5   LIVES ${s.lives}`, 14, 22);
  ctx.fillStyle = '#ffd278';
  ctx.fillText('NEBULA STRIKE', W - 150, 22);
  ctx.fillStyle = '#7f93b8';
  ctx.font = '11px Consolas, monospace';
  ctx.fillText('[ARROWS] move   [SPACE] fire   [R] restart', 14, H - 10);
  ctx.fillStyle = '#5dd88a';
  ctx.fillText(s.engine === 'wasm64' ? '▶ game engine: WASM64 (memory64)' : '▶ game engine: JS fallback (no memory64)', W - 235, H - 10);

  if (s.gameOver) {
    ctx.fillStyle = 'rgba(5,8,20,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = s.win ? '#78ffa0' : '#ff5a5a';
    ctx.font = 'bold 54px Impact, sans-serif';
    ctx.fillText(s.win ? 'VICTORY!' : 'GAME OVER', W / 2, H / 2 - 40);
    ctx.fillStyle = '#dce6ff';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillText(`FINAL SCORE: ${s.score}`, W / 2, H / 2 + 15);
    ctx.fillStyle = '#96c8ff';
    ctx.font = '15px Consolas, monospace';
    ctx.fillText('Press R to fly again', W / 2, H / 2 + 52);
    ctx.textAlign = 'left';
  }
}

export default function NebulaApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { windows, setBestScore, bestScore, pushToast, soundEnabled } = useOS();
  const keys = useRef({ left: false, right: false, fire: false });
  const tsGame = useRef(new NebulaGame(1337n));
  const wasm = useRef(new NebulaWasm64());
  const [engine, setEngine] = useState<'wasm64' | 'ts'>('ts');
  const [wasmReady, setWasmReady] = useState(false);
  const [fps, setFps] = useState(60);
  const [hud, setHud] = useState({ score: 0, lives: 3, wave: 1, gameOver: false, win: false });
  const [autoRunning, setAutoRunning] = useState(false);
  const [glInfo, setGlInfo] = useState<GLInfo | null>(null);
  const [renderer, setRenderer] = useState<'webgl2' | 'webgl' | 'canvas2d'>('canvas2d');
  const glRef = useRef<NebulaGL | null>(null);
  const [autoResult, setAutoResult] = useState<string | null>(null);
  const [benchResult, setBenchResult] = useState<string | null>(null);
  const scoreAtEnd = useRef(0);
  const endedRef = useRef(false);

  // init WASM64 module
  useEffect(() => {
    wasm.current.init().then(info => {
      if (info.supported) { setEngine('wasm64'); setWasmReady(true); wasm.current.reset(); }
      else console.warn('wasm64 unavailable:', info.error);
    });
  }, []);

  const doReset = () => {
    tsGame.current = new NebulaGame(1337n);
    if (wasmReady) wasm.current.reset();
    endedRef.current = false;
    setAutoResult(null);
  };

  // keyboard
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const gameFocused = () => {
      const top = windows.filter(w => !w.minimized).reduce<typeof windows[number] | null>((a, w) => (!a || w.z > a.z ? w : a), null);
      return top?.app === 'nebula';
    };
    const dn = (e: KeyboardEvent) => {
      // only react while the game window is the focused one and the user isn't typing in another app
      if (isTyping(e) || !gameFocused()) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code) || e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyR') {
        e.preventDefault();
      }
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': keys.current.left = true; break;
        case 'ArrowRight': case 'KeyD': keys.current.right = true; break;
        case 'Space': case 'ArrowUp': case 'KeyW': keys.current.fire = true; break;
        case 'KeyR': doReset(); break;
      }
    };
    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': keys.current.left = false; break;
        case 'ArrowRight': case 'KeyD': keys.current.right = false; break;
        case 'Space': case 'ArrowUp': case 'KeyW': keys.current.fire = false; break;
      }
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows]);

  // game loop — fixed 60Hz simulation, render every rAF
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // WebGL first (WebGL2 → WebGL1); Canvas 2D only if the GPU path is unavailable
    let gl = glRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    if (!gl) {
      try { gl = new NebulaGL(canvas); glRef.current = gl; setGlInfo(gl.info); setRenderer(gl.info.api); }
      catch (e) { console.warn('WebGL unavailable, using Canvas 2D:', e); }
    }
    if (!gl) { ctx = canvas.getContext('2d'); if (!ctx) return; setRenderer('canvas2d'); }
    let raf = 0;
    let acc = 0, last = performance.now();
    let frames = 0, fpsTimer = performance.now();

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += now - last; last = now;
      const STEP = 1000 / 60;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        if (engine === 'wasm64') wasm.current.step(keys.current.left, keys.current.right, keys.current.fire);
        else tsGame.current.step(keys.current.left, keys.current.right, keys.current.fire);
        acc -= STEP; steps++;
      }

      let snap: Snapshot;
      if (gl && engine === 'wasm64') {
        // GPU path, zero-copy: vertex data is read straight out of the wasm64 linear memory
        const st = wasm.current.state();
        const v = wasm.current.views();
        snap = { engine, ...st, stars: [], bolts: [], enemies: [], parts: [] };
        gl.begin();
        if (v) {
          const { f32, strides } = v;
          for (let i = 0; i < v.starsN; i++) { const o = (v.stars + i * strides.star) >> 2; gl.addStar(f32[o], f32[o + 1], f32[o + 2]); }
          for (let i = 0; i < v.partsN; i++) { const o = (v.parts + i * strides.part) >> 2; gl.addParticle(f32[o], f32[o + 1], f32[o + 4]); }
          for (let i = 0; i < v.boltsN; i++) { const o = (v.bolts + i * strides.bolt) >> 2; gl.addBolt(f32[o], f32[o + 1]); }
          for (let i = 0; i < v.enemiesN; i++) { const o = (v.enemies + i * strides.enemy) >> 2; gl.addEnemy(f32[o], f32[o + 1], f32[o + 4]); }
        }
        if (!st.gameOver || st.lives > 0) gl.addShip(st.shipX, now);
        gl.end({ score: st.score, lives: st.lives, wave: st.wave, gameOver: st.gameOver, win: st.win, engine }, st.shake, now);
      } else {
        snap = engine === 'wasm64'
          ? { engine, ...wasm.current.state(), stars: wasm.current.stars(), bolts: wasm.current.bolts(), enemies: wasm.current.enemies(), parts: wasm.current.particles() }
          : {
              engine,
              shipX: tsGame.current.shipX, shake: tsGame.current.shake, gameOver: tsGame.current.gameOver, win: tsGame.current.win,
              score: tsGame.current.score, lives: tsGame.current.lives, wave: tsGame.current.wave,
              stars: tsGame.current.stars, bolts: tsGame.current.bolts, enemies: tsGame.current.enemies, parts: tsGame.current.parts,
            };
        if (gl) {
          gl.begin();
          for (const st of snap.stars) gl.addStar(st.x, st.y, st.vy);
          for (const p of snap.parts) gl.addParticle(p.x, p.y, p.life);
          for (const b of snap.bolts) gl.addBolt(b.x, b.y);
          for (const e of snap.enemies) gl.addEnemy(e.x, e.y, e.r);
          if (!snap.gameOver || snap.lives > 0) gl.addShip(snap.shipX, now);
          gl.end({ score: snap.score, lives: snap.lives, wave: snap.wave, gameOver: snap.gameOver, win: snap.win, engine }, snap.shake, now);
        } else if (ctx) drawScene(ctx, snap, now);
      }

      frames++;
      if (now - fpsTimer >= 500) {
        setFps(Math.round((frames * 1000) / (now - fpsTimer)));
        frames = 0; fpsTimer = now;
        setHud({ score: snap.score, lives: snap.lives, wave: snap.wave, gameOver: snap.gameOver, win: snap.win });
      }
      if (snap.gameOver && !endedRef.current) {
        endedRef.current = true;
        scoreAtEnd.current = snap.score;
        setBestScore(snap.score);
        if (soundEnabled) {
          try {
            const ac = new AudioContext();
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = snap.win ? 'triangle' : 'sawtooth';
            o.frequency.setValueAtTime(snap.win ? 660 : 220, ac.currentTime);
            o.frequency.exponentialRampToValueAtTime(snap.win ? 880 : 55, ac.currentTime + 0.8);
            g.gain.setValueAtTime(0.12, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
            o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.9);
          } catch { /* audio unavailable */ }
        }
        if (snap.win) pushToast('NEBULA STRIKE', `VICTORY! Final score ${snap.score}`, 'game');
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, wasmReady, soundEnabled]);

  const runAutotest = async () => {
    setAutoRunning(true); setAutoResult(null);
    if (engine === 'wasm64' && wasmReady) {
      await new Promise(r => setTimeout(r, 30));
      const frames = wasm.current.autotest();
      const res = wasm.current.autoResult();
      setAutoResult(`${res.win ? 'WIN' : 'DEFEAT'} · score ${res.score} · wave ${res.wave}/5 · ${frames} frames · ${res.lives} lives`);
      // restart interactive game state after autotest clobbered it
      wasm.current.reset();
      endedRef.current = false;
    } else {
      const g = new NebulaGame(1337n);
      let frames = 0;
      while (!g.gameOver && frames < 60 * 180) {
        // chase lowest enemy, dodge close threats
        let left = false, right = false;
        const shipY = H - 70;
        for (const e of g.enemies) {
          const dx = e.x - g.shipX;
          if (Math.abs(dx) < 70 && shipY - e.y > 0 && shipY - e.y < 150) { if (dx >= 0) left = true; else right = true; break; }
        }
        if (!left && !right && g.enemies.length) {
          let best = -1, tx = W / 2;
          for (const e of g.enemies) if (e.y > best) { best = e.y; tx = e.x; }
          if (tx < g.shipX - 6) left = true; else if (tx > g.shipX + 6) right = true;
        }
        g.step(left, right, true);
        frames++;
      }
      setAutoResult(`${g.win ? 'WIN' : 'DEFEAT'} · score ${g.score} · wave ${g.wave}/5 · ${frames} frames · ${g.lives} lives`);
    }
    setAutoRunning(false);
    pushToast('Autotest complete', engine === 'wasm64' ? 'Ran inside the real wasm64 module' : 'Ran in the deterministic TS core', 'game');
  };

  const runBench = async () => {
    setBenchResult(null);
    if (engine === 'wasm64' && wasmReady) {
      await new Promise(r => setTimeout(r, 30));
      const fpsVal = wasm.current.bench();
      setBenchResult(`${Math.round(fpsVal).toLocaleString()} logic fps (wasm64)`);
      wasm.current.reset(); endedRef.current = false;
    } else {
      const g = new NebulaGame(1337n);
      const t0 = performance.now();
      for (let i = 0; i < 3600; i++) g.step(i % 120 < 60, i % 120 >= 60, true);
      const dt = performance.now() - t0;
      setBenchResult(`${Math.round(3600 / (dt / 1000)).toLocaleString()} logic fps (TS core)`);
    }
  };

  const fpsColor = fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400';

  // on-screen controls for phones/tablets (Android, iOS, touch laptops)
  const coarse = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const [touchUI, setTouchUI] = useState<boolean>(() => coarse());
  const [pressed, setPressed] = useState<string>('');
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const upd = () => setTouchUI(coarse());
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);
  const hold = (k: 'left' | 'right' | 'fire') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); keys.current[k] = true; setPressed(p => p.includes(k) ? p : (p + ' ' + k).trim()); },
    onPointerUp: () => { keys.current[k] = false; setPressed(p => p.split(' ').filter(x => x !== k).join(' ')); },
    onPointerCancel: () => { keys.current[k] = false; setPressed(p => p.split(' ').filter(x => x !== k).join(' ')); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="flex h-full w-full flex-col sm:flex-row bg-[#05070f] text-[#cfe3ff] overflow-y-auto sm:overflow-hidden">
      {/* game canvas */}
      <div className="flex flex-1 min-w-0 flex-col items-center justify-center p-3 gap-2">
        <div className="relative w-full max-w-[760px]">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full rounded-md border border-cyan-900/70 shadow-[0_0_40px_rgba(30,180,255,0.25)] bg-black"
            data-renderer={renderer}
            data-engine={engine}
          />
          <div className="absolute top-2 right-2 flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-[10px] font-mono backdrop-blur-sm border border-cyan-900/60">
            <span className={`font-bold ${fpsColor}`}>{fps} FPS</span>
            <span className="text-cyan-200/60">·</span>
            <span className="text-cyan-200/80">{engine === 'wasm64' ? 'WASM64 · MEMORY64' : 'TS CORE'}</span>
            <span className="text-cyan-200/60">·</span>
            <span className={renderer === 'canvas2d' ? 'text-amber-300' : 'text-emerald-300'} title={glInfo ? `${glInfo.renderer} · ${glInfo.version}` : 'Canvas 2D fallback'}>{renderer.toUpperCase()}</span>
          </div>
        </div>
        {touchUI && (
          <div className="flex w-full max-w-[760px] select-none items-center justify-between gap-2 font-mono text-[12px]" data-touch-controls data-pressed={pressed}>
            <div className="flex gap-2">
              <button {...hold('left')} aria-label="Move left" className="h-14 w-16 touch-none rounded-lg border border-cyan-700/60 bg-cyan-950/50 text-xl text-cyan-100 active:bg-cyan-700/60">◀</button>
              <button {...hold('right')} aria-label="Move right" className="h-14 w-16 touch-none rounded-lg border border-cyan-700/60 bg-cyan-950/50 text-xl text-cyan-100 active:bg-cyan-700/60">▶</button>
            </div>
            <button onClick={doReset} aria-label="Restart" className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] text-cyan-200/70">R · restart</button>
            <button {...hold('fire')} aria-label="Fire" className="h-14 w-24 touch-none rounded-lg border border-emerald-600/60 bg-emerald-950/50 font-bold tracking-widest text-emerald-200 active:bg-emerald-600/60">FIRE</button>
          </div>
        )}
      </div>

      {/* side panel */}
      <div className="w-full sm:w-[210px] shrink-0 border-t sm:border-t-0 sm:border-l border-cyan-950/80 bg-[#070b16] p-3 flex flex-col gap-3 text-[11px] font-mono sm:overflow-y-auto">
        <div>
          <div className="text-cyan-300/70 text-[10px] tracking-widest mb-1">TELEMETRY</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded bg-cyan-950/30 border border-cyan-900/40 p-1.5"><div className="text-[9px] text-cyan-500">BEST</div><div className="text-amber-300 font-bold">{bestScore}</div></div>
            <div className="rounded bg-cyan-950/30 border border-cyan-900/40 p-1.5"><div className="text-[9px] text-cyan-500">SCORE</div><div className="text-cyan-100 font-bold">{hud.score}</div></div>
            <div className="rounded bg-cyan-950/30 border border-cyan-900/40 p-1.5"><div className="text-[9px] text-cyan-500">WAVE</div><div className="text-cyan-100 font-bold">{hud.wave}/5</div></div>
            <div className="rounded bg-cyan-950/30 border border-cyan-900/40 p-1.5"><div className="text-[9px] text-cyan-500">LIVES</div><div className="text-cyan-100 font-bold">{hud.lives}</div></div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="text-cyan-300/70 text-[10px] tracking-widest">ACTIONS</div>
          <button onClick={doReset} className="flex items-center gap-2 rounded border border-cyan-800/60 bg-cyan-950/40 px-2 py-1.5 hover:bg-cyan-900/40 transition-colors">
            <RotateCcw size={12} /> Restart (R)
          </button>
          <button onClick={runAutotest} disabled={autoRunning} className="flex items-center gap-2 rounded border border-emerald-800/60 bg-emerald-950/40 px-2 py-1.5 hover:bg-emerald-900/40 transition-colors disabled:opacity-50">
            <Cpu size={12} /> {autoRunning ? 'AI pilot playing…' : 'Run AI autotest'}
          </button>
          <button onClick={runBench} className="flex items-center gap-2 rounded border border-violet-800/60 bg-violet-950/40 px-2 py-1.5 hover:bg-violet-900/40 transition-colors">
            <Gauge size={12} /> Benchmark logic fps
          </button>
          <a href="/downloads/NebulaStrike.exe" download className="flex items-center gap-2 rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 hover:bg-amber-900/40 transition-colors">
            <Download size={12} /> NebulaStrike.exe
          </a>
        </div>

        {autoResult && (
          <div className="rounded border border-emerald-800/60 bg-emerald-950/30 p-2 text-[10px] leading-relaxed">
            <div className="text-emerald-400 font-bold mb-0.5">AUTOTEST RESULT</div>
            {autoResult}
          </div>
        )}
        {benchResult && (
          <div className="rounded border border-violet-800/60 bg-violet-950/30 p-2 text-[10px] leading-relaxed">
            <div className="text-violet-300 font-bold mb-0.5">BENCHMARK</div>
            {benchResult}
          </div>
        )}

        <div className="mt-auto rounded border border-cyan-900/50 bg-black/40 p-2 text-[9px] text-cyan-100/50 leading-relaxed">
          <div className="flex items-center gap-1 text-cyan-400/80 font-bold mb-0.5"><Zap size={10} /> BUILD INFO</div>
          x86_64-windows-gnu · PE32+<br />
          wasm64-wasi · memory64<br />
          wasm32-wasi · WASI p1<br />
          core: deterministic C (xoro64)<br />
          renderer: {renderer === 'canvas2d' ? 'Canvas 2D (fallback)' : renderer.toUpperCase()}<br />
          {glInfo && <span className="break-all" data-gl-renderer>{glInfo.renderer.slice(0, 60)}</span>}
        </div>
      </div>
    </div>
  );
}
