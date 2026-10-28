// ---- freestanding-safe math & RNG (deterministic) ----
static unsigned long long g_rngState = 0x9E3779B97F4A7C15ULL;
static void srand_(unsigned long long s) { g_rngState = s ? s : 0x9E3779B97F4A7C15ULL; }
static unsigned long long xoro64(void) {
    unsigned long long x = g_rngState;
    x ^= x << 13; x ^= x >> 7; x ^= x << 17;
    g_rngState = x; return x;
}
static float frand(void) { return (float)(xoro64() >> 40) / 16777216.0f; } // [0,1)
static int frandInt(int n) { return (int)(xoro64() % (unsigned long long)n); }

// polynomial trig/sqrt — no libm dependency (freestanding WASM safe)
static float fsqrt(float x) {
    if (x <= 0.0f) return 0.0f;
    float g = x > 1.0f ? x : 1.0f;
    for (int i = 0; i < 12; i++) g = 0.5f * (g + x / g);
    return g;
}
static float fsin(float x) {
    // range-reduce to [-pi, pi]
    const float PI = 3.14159265358979323846f;
    const float TWO_PI = 6.28318530717958647692f;
    while (x > PI) x -= TWO_PI;
    while (x < -PI) x += TWO_PI;
    // Taylor series (Cody-Waite lite; good enough for a game)
    float x2 = x * x;
    float term = x, sum = x;
    term *= -x2 / 6.0f;  sum += term;
    term *= -x2 / 20.0f; sum += term;
    term *= -x2 / 42.0f; sum += term;
    term *= -x2 / 72.0f; sum += term;
    term *= -x2 / 110.0f; sum += term;
    return sum;
}
static float fcos(float x) { return fsin(x + 1.57079632679489661923f); }
static float fabs_(float x) { return x < 0 ? -x : x; }

// Nebula Strike — shared game core (included by all platform builds)
// ----------------------------- game state ---------------------------------
typedef struct { float x, y, vx, vy, r; int hp, t; } Enemy;
typedef struct { float x, y, vx, vy, life; } Particle;
typedef struct { float x, y, vy; } Star;
typedef struct { float x, y, vx, vy, life; } Bolt;

static float shipX = W / 2.0f, shipY = H - 70.0f;
static float shipVX = 0.0f;
static int   score = 0;
static int   lives = 3;
static int   wave = 1;
static int   gameOver = 0;
static int   win = 0;
static int   shake = 0;
static int   tick = 0;
static float enemySpawn = 0.0f;
static float fireCooldown = 0.0f;
static int   starsN = 0, boltsN = 0, enemiesN = 0, partsN = 0;
static int   enemiesLeftInWave = 8;
static int   enemiesKilledInWave = 0;

static Star     stars[120];
static Bolt     bolts[256];
static Enemy    enemies[64];
static Particle parts[512];

static void initStars(void) {
    starsN = 0;
    for (int i = 0; i < 120; i++) {
        stars[starsN].x = frand() * W;
        stars[starsN].y = frand() * H;
        stars[starsN].vy = 0.3f + frand() * 1.6f;
        starsN++;
    }
}

static void spawnParticles(float x, float y, int n) {
    for (int i = 0; i < n && partsN < 512; i++) {
        float a = frand() * 6.2831853f;
        float sp = 1.0f + frand() * 3.5f;
        parts[partsN].x = x; parts[partsN].y = y;
        parts[partsN].vx = fcos(a) * sp; parts[partsN].vy = fsin(a) * sp;
        parts[partsN].life = 30.0f + (float)(frandInt(30));
        partsN++;
    }
}

static void spawnEnemy(void) {
    if (enemiesN >= 64) return;
    enemies[enemiesN].x = 40.0f + frand() * (W - 80);
    enemies[enemiesN].y = -30.0f;
    enemies[enemiesN].vx = (frand() - 0.5f) * 2.0f;
    enemies[enemiesN].vy = 0.7f + wave * 0.35f + frand() * 0.6f;
    enemies[enemiesN].r = 14.0f + (float)(frandInt(10));
    enemies[enemiesN].hp = 1 + wave / 2;
    enemies[enemiesN].t = frandInt(1000);
    enemiesN++;
}

static void resetGame(void) {
    score = 0; lives = 3; wave = 1; gameOver = 0; win = 0; shake = 0; tick = 0;
    shipX = W / 2.0f; shipVX = 0; fireCooldown = 0; enemySpawn = 0;
    boltsN = 0; enemiesN = 0; partsN = 0;
    enemiesLeftInWave = 8; enemiesKilledInWave = 0;
    initStars();
}

// AI pilot used by headless autotests: dodge close threats, otherwise chase the
// lowest (most dangerous) enemy and fire whenever off cooldown.
static void aiPilot(int *left, int *right, int *fire) {
    *left = 0; *right = 0; *fire = 1;
    // threat check: enemy close to the ship
    for (int i = 0; i < enemiesN; i++) {
        float dx = enemies[i].x - shipX;
        float adx = dx < 0 ? -dx : dx;
        float dy = shipY - enemies[i].y; // >0 when enemy above ship
        if (adx < 70.0f && dy > 0.0f && dy < 150.0f) {
            // dodge away from the threat
            if (dx >= 0) { *left = 1; return; }
            *right = 1; return;
        }
    }
    // otherwise chase the lowest enemy (closest to ship vertically)
    float bestY = -1e9f; float tx = W / 2.0f; int found = 0;
    for (int i = 0; i < enemiesN; i++) {
        if (enemies[i].y > bestY) { bestY = enemies[i].y; tx = enemies[i].x; found = 1; }
    }
    if (found) {
        if (tx < shipX - 6) *left = 1; else if (tx > shipX + 6) *right = 1;
    }
}

// one fixed-timestep simulation step (called at 60 Hz)
static void stepGame(int left, int right, int fire) {
    tick++;
    for (int i = 0; i < starsN; i++) {
        stars[i].y += stars[i].vy * (gameOver ? 0.3f : 1.0f);
        if (stars[i].y > H) { stars[i].y = 0; stars[i].x = frand() * W; }
    }
    if (gameOver) {
        for (int i = 0; i < partsN; i++) { parts[i].x += parts[i].vx; parts[i].y += parts[i].vy; parts[i].life -= 1.0f; }
        { int k = 0; for (int i = 0; i < partsN; i++) if (parts[i].life > 0) parts[k++] = parts[i]; partsN = k; }
        return;
    }

    float accel = 0.55f, damp = 0.86f;
    if (left)  shipVX -= accel;
    if (right) shipVX += accel;
    shipVX *= damp;
    shipX += shipVX;
    if (shipX < 24) { shipX = 24; shipVX = 0; }
    if (shipX > W - 24) { shipX = W - 24; shipVX = 0; }

    if (fireCooldown > 0) fireCooldown -= 1.0f;
    if (fire && fireCooldown <= 0) {
        if (boltsN < 256) {
            bolts[boltsN].x = shipX - 3; bolts[boltsN].y = shipY - 24; bolts[boltsN].vx = 0; bolts[boltsN].vy = -9.5f; bolts[boltsN].life = 60; boltsN++;
            bolts[boltsN].x = shipX + 3; bolts[boltsN].y = shipY - 24; bolts[boltsN].vx = 0; bolts[boltsN].vy = -9.5f; bolts[boltsN].life = 60; boltsN++;
        }
        fireCooldown = 9.0f;
    }

    if (enemiesLeftInWave > 0) {
        enemySpawn -= 1.0f;
        if (enemySpawn <= 0) { spawnEnemy(); enemiesLeftInWave--; enemySpawn = 26.0f - wave * 2.0f; }
    }

    for (int i = 0; i < boltsN; i++) {
        bolts[i].x += bolts[i].vx; bolts[i].y += bolts[i].vy; bolts[i].life -= 1.0f;
        for (int j = 0; j < enemiesN; j++) {
            float dx = bolts[i].x - enemies[j].x, dy = bolts[i].y - enemies[j].y;
            float rr = enemies[j].r + 3.0f;
            if (dx * dx + dy * dy < rr * rr) {
                bolts[i].life = 0;
                enemies[j].hp -= 1;
                spawnParticles(bolts[i].x, bolts[i].y, 4);
                if (enemies[j].hp <= 0) {
                    score += 100 * wave;
                    enemiesKilledInWave++;
                    spawnParticles(enemies[j].x, enemies[j].y, 26);
                    shake = 6;
                    enemies[j] = enemies[enemiesN - 1]; enemiesN--; j--;
                }
            }
        }
    }
    { int bk = 0; for (int i = 0; i < boltsN; i++) if (bolts[i].life > 0 && bolts[i].y > -20) bolts[bk++] = bolts[i]; boltsN = bk; }

    for (int i = 0; i < enemiesN; i++) {
        enemies[i].t++;
        enemies[i].x += enemies[i].vx + fsin(enemies[i].t * 0.05f) * 0.6f;
        enemies[i].y += enemies[i].vy;
        float dx = enemies[i].x - shipX, dy = enemies[i].y - shipY;
        float rr = enemies[i].r + 16.0f;
        if (dx * dx + dy * dy < rr * rr) {
            lives--;
            shake = 14;
            spawnParticles(shipX, shipY, 34);
            enemies[i] = enemies[enemiesN - 1]; enemiesN--; i--;
            if (lives <= 0) { gameOver = 1; spawnParticles(shipX, shipY, 80); }
            continue;
        }
        if (enemies[i].y > H + 40) { enemies[i] = enemies[enemiesN - 1]; enemiesN--; i--; }
    }

    for (int i = 0; i < partsN; i++) { parts[i].x += parts[i].vx; parts[i].y += parts[i].vy; parts[i].vx *= 0.98f; parts[i].vy *= 0.98f; parts[i].life -= 1.0f; }
    { int pk = 0; for (int i = 0; i < partsN; i++) if (parts[i].life > 0) parts[pk++] = parts[i]; partsN = pk; }

    if (shake > 0) shake--;

    if (enemiesLeftInWave <= 0 && enemiesN == 0 && !gameOver) {
        if (wave >= 5) { win = 1; gameOver = 1; }
        else { wave++; enemiesLeftInWave = 8 + wave * 2; enemiesKilledInWave = 0; }
    }
}

