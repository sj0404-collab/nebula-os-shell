// Memory64 WASM host — loads the real wasm64 build of Nebula Strike,
// steps it at a fixed 60 Hz and exposes its 64-bit linear memory to the WebGL renderer (src/lib/webgl.ts).
export interface Memory64Info {
  supported: boolean;
  moduleBytes: number;
  exports: string[];
  error?: string;
}

const BYTES_PATH = '/downloads/nebula_strike_wasm64.wasm';

// Struct layouts inside the wasm64 linear memory (from nebula_core.inc):
// Enemy    { float x,y,vx,vy,r; int hp,t }  -> 5*4 + 2*4 = 28 bytes (stride 28)
// Particle { float x,y,vx,vy,life }         -> 20 bytes
// Star     { float x,y,vy }                 -> 12 bytes
// Bolt     { float x,y,vx,vy,life }         -> 20 bytes
const ENEMY_STRIDE = 28, PART_STRIDE = 20, STAR_STRIDE = 12, BOLT_STRIDE = 20;

export class NebulaWasm64 {
  info: Memory64Info = { supported: false, moduleBytes: 0, exports: [] };
  private instance: WebAssembly.Instance | null = null;

  async init(): Promise<Memory64Info> {
    try {
      const res = await fetch(BYTES_PATH);
      if (!res.ok) throw new Error(`failed to fetch ${BYTES_PATH}: ${res.status}`);
      const bytes = await res.arrayBuffer();
      this.info.moduleBytes = bytes.byteLength;
      // Detect memory64 support by compiling; engines without it reject the module.
      const mod = await WebAssembly.compile(bytes);
      this.info.exports = WebAssembly.Module.exports(mod).map(e => e.name);
      this.instance = await WebAssembly.instantiate(mod, {});
      this.info.supported = true;
      return this.info;
    } catch (e) {
      this.info.error = e instanceof Error ? e.message : String(e);
      this.info.supported = false;
      return this.info;
    }
  }

  private get ex(): Record<string, (...args: number[]) => number | bigint> | null {
    return this.instance ? (this.instance.exports as unknown as Record<string, (...args: number[]) => number | bigint>) : null;
  }
  private buf(): DataView | null {
    const mem = (this.instance?.exports as Record<string, unknown> | undefined)?.memory as WebAssembly.Memory | undefined;
    return mem ? new DataView(mem.buffer) : null;
  }

  ptrBits(): bigint { return this.ex ? BigInt(this.ex.nebula_ptr_bits() as bigint) : 0n; }
  sizeBits(): bigint { return this.ex ? BigInt(this.ex.nebula_size_bits() as bigint) : 0n; }
  reset(): void { this.ex?.nebula_reset(); }
  step(left: boolean, right: boolean, fire: boolean): void {
    this.ex?.nebula_step(left ? 1 : 0, right ? 1 : 0, fire ? 1 : 0);
  }
  autotest(): number { return Number(this.ex?.nebula_autotest() ?? 0); }
  bench(): number { const t0 = performance.now(); this.ex?.nebula_bench(); const dt = performance.now() - t0; return dt > 0 ? 3600 / (dt / 1000) : 0; }
  autoResult(): { score: number; wave: number; frames: number; lives: number; win: boolean } {
    return {
      score: Number(this.ex?.nebula_auto_score() ?? 0),
      wave: Number(this.ex?.nebula_auto_wave() ?? 0),
      frames: Number(this.ex?.nebula_auto_frames() ?? 0),
      lives: Number(this.ex?.nebula_auto_lives() ?? 0),
      win: Boolean(this.ex?.nebula_auto_win()),
    };
  }
  /**
   * Zero-copy view of the entity arrays inside the 64-bit linear memory (Float32/Int32 views + byte offsets).
   * The WebGL renderer reads positions straight from here every frame.
   */
  views(): { f32: Float32Array; i32: Int32Array; stars: number; starsN: number; bolts: number; boltsN: number; enemies: number; enemiesN: number; parts: number; partsN: number; strides: { star: number; bolt: number; enemy: number; part: number } } | null {
    const mem = (this.instance?.exports as Record<string, unknown> | undefined)?.memory as WebAssembly.Memory | undefined;
    if (!mem || !this.ex) return null;
    return {
      f32: new Float32Array(mem.buffer), i32: new Int32Array(mem.buffer),
      stars: Number(this.ex.nebula_stars_ptr() as bigint), starsN: Number(this.ex.nebula_stars_count()),
      bolts: Number(this.ex.nebula_bolts_ptr() as bigint), boltsN: Number(this.ex.nebula_bolts_count()),
      enemies: Number(this.ex.nebula_enemies_ptr() as bigint), enemiesN: Number(this.ex.nebula_enemies_count()),
      parts: Number(this.ex.nebula_parts_ptr() as bigint), partsN: Number(this.ex.nebula_parts_count()),
      strides: { star: STAR_STRIDE, bolt: BOLT_STRIDE, enemy: ENEMY_STRIDE, part: PART_STRIDE },
    };
  }
  state() {
    return {
      score: Number(this.ex?.nebula_score() ?? 0),
      lives: Number(this.ex?.nebula_lives() ?? 0),
      wave: Number(this.ex?.nebula_wave() ?? 1),
      gameOver: Boolean(this.ex?.nebula_gameover()),
      win: Boolean(this.ex?.nebula_win()),
      shipX: Number(this.ex?.nebula_ship_x() ?? 400),
      shake: Number(this.ex?.nebula_shake() ?? 0),
    };
  }
  stars(): { x: number; y: number; vy: number }[] {
    const b = this.buf(), ptr = Number(this.ex?.nebula_stars_ptr() as bigint), n = Number(this.ex?.nebula_stars_count() ?? 0);
    if (!b) return [];
    const out: { x: number; y: number; vy: number }[] = [];
    for (let i = 0; i < n; i++) {
      const o = ptr + i * STAR_STRIDE;
      out.push({ x: b.getFloat32(o, true), y: b.getFloat32(o + 4, true), vy: b.getFloat32(o + 8, true) });
    }
    return out;
  }
  bolts(): { x: number; y: number }[] {
    const b = this.buf(), ptr = Number(this.ex?.nebula_bolts_ptr() as bigint), n = Number(this.ex?.nebula_bolts_count() ?? 0);
    if (!b) return [];
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) { const o = ptr + i * BOLT_STRIDE; out.push({ x: b.getFloat32(o, true), y: b.getFloat32(o + 4, true) }); }
    return out;
  }
  enemies(): { x: number; y: number; r: number; hp: number; t: number }[] {
    const b = this.buf(), ptr = Number(this.ex?.nebula_enemies_ptr() as bigint), n = Number(this.ex?.nebula_enemies_count() ?? 0);
    if (!b) return [];
    const out: { x: number; y: number; r: number; hp: number; t: number }[] = [];
    for (let i = 0; i < n; i++) {
      const o = ptr + i * ENEMY_STRIDE;
      out.push({ x: b.getFloat32(o, true), y: b.getFloat32(o + 4, true), r: b.getFloat32(o + 16, true), hp: b.getInt32(o + 20, true), t: b.getInt32(o + 24, true) });
    }
    return out;
  }
  particles(): { x: number; y: number; life: number }[] {
    const b = this.buf(), ptr = Number(this.ex?.nebula_parts_ptr() as bigint), n = Number(this.ex?.nebula_parts_count() ?? 0);
    if (!b) return [];
    const out: { x: number; y: number; life: number }[] = [];
    for (let i = 0; i < n; i++) { const o = ptr + i * PART_STRIDE; out.push({ x: b.getFloat32(o, true), y: b.getFloat32(o + 4, true), life: b.getFloat32(o + 16, true) }); }
    return out;
  }
}
