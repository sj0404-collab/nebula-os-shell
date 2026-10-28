// Nebula Strike — browser port of the shared C game core (game/nebula_core.inc)
// Deterministic xoro64 RNG, identical wave logic, used when Memory64 WASM is unavailable.

export const W = 800, H = 450;
const SHIP_Y = H - 70;

export class NebulaGame {
  score = 0; lives = 3; wave = 1; gameOver = false; win = false; shake = 0; tick = 0;
  shipX = W / 2; shipVX = 0;
  stars: { x: number; y: number; vy: number }[] = [];
  bolts: { x: number; y: number }[] = [];
  enemies: { x: number; y: number; vx: number; vy: number; r: number; hp: number; t: number }[] = [];
  parts: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private rngState = 0x9E3779B97F4A7C15n;
  private enemySpawn = 0;
  private fireCooldown = 0;
  private enemiesLeftInWave = 8;

  constructor(seed = 1337n) { this.srand(seed); this.reset(); }
  srand(s: bigint) { this.rngState = s ? s : 0x9E3779B97F4A7C15n; }
  private xoro(): bigint {
    let x = this.rngState;
    x ^= x << 13n; x ^= x >> 7n; x ^= x << 17n; x &= 0xFFFFFFFFFFFFFFFFn;
    this.rngState = x; return x;
  }
  private frand(): number { return Number(this.xoro() >> 40n) / 16777216; }
  private frandInt(n: number): number { return Number(this.xoro() % BigInt(n)); }

  reset() {
    this.score = 0; this.lives = 3; this.wave = 1; this.gameOver = false; this.win = false; this.shake = 0; this.tick = 0;
    this.shipX = W / 2; this.shipVX = 0; this.enemySpawn = 0; this.fireCooldown = 0;
    this.bolts = []; this.enemies = []; this.parts = [];
    this.enemiesLeftInWave = 8;
    this.stars = [];
    for (let i = 0; i < 120; i++) this.stars.push({ x: this.frand() * W, y: this.frand() * H, vy: 0.3 + this.frand() * 1.6 });
  }

  private spawnEnemy() {
    if (this.enemies.length >= 64) return;
    this.enemies.push({
      x: 40 + this.frand() * (W - 80), y: -30,
      vx: (this.frand() - 0.5) * 2,
      vy: 0.7 + this.wave * 0.35 + this.frand() * 0.6,
      r: 14 + this.frandInt(10), hp: 1 + (this.wave >> 1), t: this.frandInt(1000),
    });
  }
  private spawnParticles(x: number, y: number, n: number) {
    for (let i = 0; i < n && this.parts.length < 512; i++) {
      const a = this.frand() * 6.2831853, sp = 1 + this.frand() * 3.5;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 30 + this.frandInt(30) });
    }
  }

  step(left: boolean, right: boolean, fire: boolean) {
    this.tick++;
    for (const s of this.stars) {
      s.y += s.vy * (this.gameOver ? 0.3 : 1);
      if (s.y > H) { s.y = 0; s.x = this.frand() * W; }
    }
    if (this.gameOver) {
      for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.life--; }
      this.parts = this.parts.filter(p => p.life > 0);
      return;
    }
    const accel = 0.55, damp = 0.86;
    if (left) this.shipVX -= accel;
    if (right) this.shipVX += accel;
    this.shipVX *= damp; this.shipX += this.shipVX;
    if (this.shipX < 24) { this.shipX = 24; this.shipVX = 0; }
    if (this.shipX > W - 24) { this.shipX = W - 24; this.shipVX = 0; }

    if (this.fireCooldown > 0) this.fireCooldown--;
    if (fire && this.fireCooldown <= 0) {
      if (this.bolts.length < 256) {
        this.bolts.push({ x: this.shipX - 3, y: SHIP_Y - 24 });
        this.bolts.push({ x: this.shipX + 3, y: SHIP_Y - 24 });
      }
      this.fireCooldown = 9;
    }
    if (this.enemiesLeftInWave > 0) {
      this.enemySpawn--;
      if (this.enemySpawn <= 0) { this.spawnEnemy(); this.enemiesLeftInWave--; this.enemySpawn = 26 - this.wave * 2; }
    }
    const kept: typeof this.bolts = [];
    for (const b of this.bolts) {
      b.y -= 9.5;
      let alive = b.y > -20;
      if (alive) {
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          const dx = b.x - e.x, dy = b.y - e.y, rr = e.r + 3;
          if (dx * dx + dy * dy < rr * rr) {
            alive = false; e.hp--;
            this.spawnParticles(b.x, b.y, 4);
            if (e.hp <= 0) { this.score += 100 * this.wave; this.spawnParticles(e.x, e.y, 26); this.shake = 6; this.enemies.splice(j, 1); }
            break;
          }
        }
      }
      if (alive) kept.push(b);
    }
    this.bolts = kept;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t++; e.x += e.vx + Math.sin(e.t * 0.05) * 0.6; e.y += e.vy;
      const dx = e.x - this.shipX, dy = e.y - SHIP_Y, rr = e.r + 16;
      if (dx * dx + dy * dy < rr * rr) {
        this.lives--; this.shake = 14; this.spawnParticles(this.shipX, SHIP_Y, 34);
        this.enemies.splice(i, 1);
        if (this.lives <= 0) { this.gameOver = true; this.spawnParticles(this.shipX, SHIP_Y, 80); }
        continue;
      }
      if (e.y > H + 40) this.enemies.splice(i, 1);
    }
    for (const p of this.parts) { p.x += p.vx; p.y += p.vy; p.vx *= 0.98; p.vy *= 0.98; p.life--; }
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.shake > 0) this.shake--;
    if (this.enemiesLeftInWave <= 0 && this.enemies.length === 0 && !this.gameOver) {
      if (this.wave >= 5) { this.win = true; this.gameOver = true; }
      else { this.wave++; this.enemiesLeftInWave = 8 + this.wave * 2; }
    }
  }
}
