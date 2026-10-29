/**
 * Nebula Strike — WebGL renderer (WebGL2, falls back to WebGL1).
 *
 * The whole frame is drawn by the GPU:
 *   pass 1  procedural background (fragment shader: vertical gradient + two nebula glows + twinkle noise)
 *   pass 2  solid geometry batch   (ship, enemy glyphs, star sprites, particles) — one dynamic VBO, one draw call
 *   pass 3  additive glow batch    (plasma bolts, engine flame, enemy halos, explosions) — soft sprites, additive blend
 *   pass 4  HUD texture            (text rasterised once per change into a small canvas → texture → one quad)
 *
 * Geometry is fed with plain numbers (addStar/addEnemy/…), so the wasm64 path copies floats straight out of
 * the module's 64-bit linear memory into the vertex buffer without creating JS objects per entity.
 */
import { W, H } from './nebula';

export const SHIP_Y = H - 70;

const VS = `
attribute vec2 aPos; attribute vec4 aColor; attribute vec2 aUv; attribute float aMode;
uniform vec2 uRes; uniform vec2 uShake;
varying vec4 vColor; varying vec2 vUv; varying float vMode;
void main() {
  vec2 p = (aPos + uShake) / uRes * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  vColor = aColor; vUv = aUv; vMode = aMode;
}`;
const FS = `
precision mediump float;
varying vec4 vColor; varying vec2 vUv; varying float vMode;
void main() {
  float a = vColor.a;
  float d = length(vUv);
  if (vMode > 2.5) {            // ring
    float w = 0.12;
    a *= smoothstep(1.0, 1.0 - w, d) * smoothstep(1.0 - 2.0 * w, 1.0 - w, d);
  } else if (vMode > 1.5) {     // disc (anti-aliased)
    a *= smoothstep(1.0, 0.85, d);
  } else if (vMode > 0.5) {     // soft glow
    float f = max(0.0, 1.0 - d);
    a *= f * f;
  }
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor.rgb * a, a);   // premultiplied
}`;
const BG_VS = `attribute vec2 aPos; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const BG_FS = `
precision mediump float;
varying vec2 vP; uniform float uTime; uniform vec2 uRes;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = vec2(vP.x * 0.5 + 0.5, 0.5 - vP.y * 0.5);        // 0..1, y down like the game
  vec2 px = uv * uRes;
  vec3 col = mix(vec3(0.016, 0.024, 0.102), vec3(0.055, 0.086, 0.196), uv.y);   // #04061a → #0e1632
  float n1 = 1.0 - smoothstep(10.0, 175.0, distance(px, vec2(180.0, 110.0)));
  col += vec3(0.59, 0.27, 0.63) * 0.5 * n1 * n1;
  float n2 = 1.0 - smoothstep(10.0, 210.0, distance(px, vec2(620.0, 330.0)));
  col += vec3(0.24, 0.55, 0.86) * 0.5 * n2 * n2;
  // faint dust / twinkle
  float h = hash(floor(px / 3.0));
  float tw = step(0.996, h) * (0.5 + 0.5 * sin(uTime * 0.004 + h * 60.0));
  col += vec3(0.6, 0.7, 0.9) * tw * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;
const TEX_VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;
const TEX_FS = `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; void main(){ gl_FragColor = texture2D(uTex, vUv); }`;

export interface GLInfo { api: 'webgl2' | 'webgl'; renderer: string; vendor: string; version: string }
export interface HudState { score: number; lives: number; wave: number; gameOver: boolean; win: boolean; engine: 'wasm64' | 'ts' }

const FLOATS = 9; // pos2 color4 uv2 mode1

class Batch {
  data = new Float32Array(FLOATS * 6 * 1024);
  n = 0; // floats used
  reset() { this.n = 0; }
  private ensure(extra: number) {
    if (this.n + extra <= this.data.length) return;
    const next = new Float32Array(Math.max(this.data.length * 2, this.n + extra));
    next.set(this.data.subarray(0, this.n)); this.data = next;
  }
  vertex(x: number, y: number, r: number, g: number, b: number, a: number, u: number, v: number, mode: number) {
    this.ensure(FLOATS);
    const d = this.data, i = this.n;
    d[i] = x; d[i + 1] = y; d[i + 2] = r; d[i + 3] = g; d[i + 4] = b; d[i + 5] = a; d[i + 6] = u; d[i + 7] = v; d[i + 8] = mode;
    this.n += FLOATS;
  }
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, r: number, g: number, b: number, a: number) {
    this.vertex(x1, y1, r, g, b, a, 0, 0, 0); this.vertex(x2, y2, r, g, b, a, 0, 0, 0); this.vertex(x3, y3, r, g, b, a, 0, 0, 0);
  }
  rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    this.tri(x, y, x + w, y, x + w, y + h, r, g, b, a); this.tri(x, y, x + w, y + h, x, y + h, r, g, b, a);
  }
  /** sprite quad centred at (cx,cy) with uv -1..1 (mode 1 glow, 2 disc, 3 ring) */
  sprite(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number, mode: number) {
    this.vertex(cx - rx, cy - ry, r, g, b, a, -1, -1, mode); this.vertex(cx + rx, cy - ry, r, g, b, a, 1, -1, mode); this.vertex(cx + rx, cy + ry, r, g, b, a, 1, 1, mode);
    this.vertex(cx - rx, cy - ry, r, g, b, a, -1, -1, mode); this.vertex(cx + rx, cy + ry, r, g, b, a, 1, 1, mode); this.vertex(cx - rx, cy + ry, r, g, b, a, -1, 1, mode);
  }
  /** convex polygon (fan) */
  poly(pts: number[], r: number, g: number, b: number, a: number) {
    for (let i = 2; i + 1 < pts.length; i += 2) this.tri(pts[0], pts[1], pts[i - 2], pts[i - 1], pts[i], pts[i + 1], r, g, b, a);
  }
}

export class NebulaGL {
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  readonly info: GLInfo;
  private geo: WebGLProgram; private bg: WebGLProgram; private tex: WebGLProgram;
  private vbo: WebGLBuffer; private quad: WebGLBuffer;
  private solid = new Batch(); private glow = new Batch();
  private hudCanvas: HTMLCanvasElement; private hudTex: WebGLTexture; private hudKey = '';
  private loc: { pos: number; color: number; uv: number; mode: number; res: WebGLUniformLocation | null; shake: WebGLUniformLocation | null; bgTime: WebGLUniformLocation | null; bgRes: WebGLUniformLocation | null; bgPos: number; texPos: number };
  drawCalls = 0; vertices = 0;

  constructor(canvas: HTMLCanvasElement) {
    const opts: WebGLContextAttributes = { alpha: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    let api: GLInfo['api'] = 'webgl2';
    let gl = canvas.getContext('webgl2', opts) as WebGL2RenderingContext | null;
    if (!gl) { api = 'webgl'; gl = canvas.getContext('webgl', opts) as WebGL2RenderingContext | null; }
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.info = {
      api,
      renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      version: String(gl.getParameter(gl.VERSION)),
    };
    this.geo = this.program(VS, FS); this.bg = this.program(BG_VS, BG_FS); this.tex = this.program(TEX_VS, TEX_FS);
    this.vbo = gl.createBuffer()!; this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.loc = {
      pos: gl.getAttribLocation(this.geo, 'aPos'), color: gl.getAttribLocation(this.geo, 'aColor'), uv: gl.getAttribLocation(this.geo, 'aUv'), mode: gl.getAttribLocation(this.geo, 'aMode'),
      res: gl.getUniformLocation(this.geo, 'uRes'), shake: gl.getUniformLocation(this.geo, 'uShake'),
      bgTime: gl.getUniformLocation(this.bg, 'uTime'), bgRes: gl.getUniformLocation(this.bg, 'uRes'), bgPos: gl.getAttribLocation(this.bg, 'aPos'),
      texPos: gl.getAttribLocation(this.tex, 'aPos'),
    };
    this.hudCanvas = document.createElement('canvas'); this.hudCanvas.width = W; this.hudCanvas.height = H;
    this.hudTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(p));
    return p;
  }

  // ---------- scene building ----------
  begin() { this.solid.reset(); this.glow.reset(); }
  addStar(x: number, y: number, vy: number) {
    const b = (140 + vy * 60) / 255;
    this.solid.rect(x, y, 2, 2, b, b, b, 1);
    if (vy > 1.4) this.solid.rect(x, y + 4, 2, 5, b, b, b, 0.9);
  }
  addParticle(x: number, y: number, life: number) {
    const a = Math.max(0, Math.min(1, life / 60));
    this.solid.rect(x - 1.5, y - 1.5, 3, 3, 1, 0.63 * a, 0.24 * a, a);
    this.glow.sprite(x, y, 6, 6, 1, 0.5 * a, 0.15, 0.35 * a, 1);
  }
  addBolt(x: number, y: number) {
    this.glow.sprite(x, y - 1, 12, 16, 0.35, 0.95, 1, 0.55, 1);        // #59f2ff halo
    this.solid.rect(x - 2, y - 7, 4, 12, 0.73, 0.96, 1, 1);             // #baf6ff core
  }
  addEnemy(x: number, y: number, r: number) {
    this.glow.sprite(x, y, r * 1.9, r * 1.9, 1, 0.3, 0.3, 0.45, 1);     // #ff4d4d halo
    this.solid.poly([x, y + r, x - r, y - r / 2, x - r / 2, y - r, x, y - r / 2, x + r / 2, y - r, x + r, y - r / 2], 0.84, 0.235, 0.275, 1); // #d63c46 glyph
    this.solid.sprite(x, y, 4.5, 4.5, 1, 0.82, 0.4, 1, 2);              // #ffd166 core
    this.solid.sprite(x, y, r + 1, r + 1, 1, 0.51, 0.51, 0.8, 3);       // ring
  }
  addShip(x: number, time: number) {
    const y = SHIP_Y;
    this.glow.sprite(x, y, 30, 30, 0.27, 0.7, 1, 0.5, 1);               // #46b4ff halo
    this.solid.poly([x, y - 22, x - 18, y + 16, x - 8, y + 8, x, y + 14], 0.27, 0.7, 1, 1);
    this.solid.poly([x, y - 22, x, y + 14, x + 8, y + 8, x + 18, y + 16], 0.27, 0.7, 1, 1);
    this.solid.sprite(x, y - 4, 4, 7, 0.7, 0.94, 1, 1, 2);               // cockpit
    const fl = 8 + Math.sin(time * 0.02) * 3 + Math.random() * 3;
    this.solid.tri(x - 5, y + 16, x + 5, y + 16, x, y + 16 + fl + 8, 1, 0.63, 0.16, 1);   // flame
    this.glow.sprite(x, y + 22 + fl / 2, 10, 10 + fl, 1, 0.55, 0.1, 0.6, 1);
  }

  // ---------- frame ----------
  end(hud: HudState, shake: number, time: number) {
    const gl = this.gl;
    this.drawCalls = 0;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.BLEND);
    // pass 1: background
    gl.useProgram(this.bg);
    gl.uniform1f(this.loc.bgTime, time); gl.uniform2f(this.loc.bgRes, W, H);
    this.drawQuad(this.loc.bgPos);
    // pass 2/3: geometry
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    gl.useProgram(this.geo);
    gl.uniform2f(this.loc.res, W, H); gl.uniform2f(this.loc.shake, sx, sy);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied alpha
    this.drawBatch(this.solid);
    gl.blendFunc(gl.ONE, gl.ONE);                   // additive glow
    this.drawBatch(this.glow);
    // pass 4: HUD texture
    this.updateHud(hud);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    this.drawQuad(this.loc.texPos);
    this.vertices = (this.solid.n + this.glow.n) / FLOATS;
  }

  private drawQuad(posLoc: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6); this.drawCalls++;
  }
  private drawBatch(b: Batch) {
    if (!b.n) return;
    const gl = this.gl, S = FLOATS * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.n), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.loc.pos); gl.vertexAttribPointer(this.loc.pos, 2, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(this.loc.color); gl.vertexAttribPointer(this.loc.color, 4, gl.FLOAT, false, S, 8);
    gl.enableVertexAttribArray(this.loc.uv); gl.vertexAttribPointer(this.loc.uv, 2, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(this.loc.mode); gl.vertexAttribPointer(this.loc.mode, 1, gl.FLOAT, false, S, 32);
    gl.drawArrays(gl.TRIANGLES, 0, b.n / FLOATS); this.drawCalls++;
  }

  private updateHud(h: HudState) {
    const key = `${h.score}|${h.lives}|${h.wave}|${h.gameOver}|${h.win}|${h.engine}|${this.info.api}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const c = this.hudCanvas.getContext('2d')!;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,16,36,0.72)';
    c.fillRect(0, 0, W, 34); c.fillRect(0, H - 30, W, 30);
    c.fillStyle = '#96e6ff'; c.font = 'bold 15px Consolas, monospace';
    c.fillText(`SCORE ${String(h.score).padStart(6, '0')}   WAVE ${h.wave}/5   LIVES ${h.lives}`, 14, 22);
    c.fillStyle = '#ffd278'; c.fillText('NEBULA STRIKE', W - 150, 22);
    c.fillStyle = '#7f93b8'; c.font = '11px Consolas, monospace';
    c.fillText('[ARROWS] move   [SPACE] fire   [R] restart', 14, H - 10);
    c.fillStyle = '#5dd88a';
    c.fillText(h.engine === 'wasm64' ? `▶ engine: WASM64 (memory64) · renderer: ${this.info.api.toUpperCase()}` : `▶ engine: JS fallback · renderer: ${this.info.api.toUpperCase()}`, W - 330, H - 10);
    if (h.gameOver) {
      c.fillStyle = 'rgba(5,8,20,0.78)'; c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = h.win ? '#78ffa0' : '#ff5a5a'; c.font = 'bold 54px Impact, sans-serif';
      c.fillText(h.win ? 'VICTORY!' : 'GAME OVER', W / 2, H / 2 - 40);
      c.fillStyle = '#dce6ff'; c.font = 'bold 22px Consolas, monospace';
      c.fillText(`FINAL SCORE: ${h.score}`, W / 2, H / 2 + 15);
      c.fillStyle = '#96c8ff'; c.font = '15px Consolas, monospace';
      c.fillText('Press R to fly again', W / 2, H / 2 + 52);
      c.textAlign = 'left';
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.hudCanvas);
  }

  dispose() {
    const ext = this.gl.getExtension('WEBGL_lose_context'); ext?.loseContext();
  }
}
