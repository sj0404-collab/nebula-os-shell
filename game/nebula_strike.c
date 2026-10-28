// ============================================================================
//  NEBULA STRIKE — Big Pickle Studios
//  Cross-platform native build:
//    - Windows x86_64  -> NebulaStrike.exe  (Win32 GDI software renderer)
//    - wasm64-wasi     -> nebula_strike.wasm (WASI preview1, same game core)
//    - wasm32-wasi     -> nebula_strike32.wasm
//  Single source of truth for both binaries.
// ============================================================================
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <stdint.h>

#ifdef _WIN32
#include <windows.h>
#endif

#define W 800
#define H 450

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
        stars[starsN].x = (float)rand() / (float)RAND_MAX * W;
        stars[starsN].y = (float)rand() / (float)RAND_MAX * H;
        stars[starsN].vy = 0.3f + (float)rand() / (float)RAND_MAX * 1.6f;
        starsN++;
    }
}

static void spawnParticles(float x, float y, int n) {
    for (int i = 0; i < n && partsN < 512; i++) {
        float a = (float)rand() / (float)RAND_MAX * 6.2831853f;
        float sp = 1.0f + (float)rand() / (float)RAND_MAX * 3.5f;
        parts[partsN].x = x; parts[partsN].y = y;
        parts[partsN].vx = cosf(a) * sp; parts[partsN].vy = sinf(a) * sp;
        parts[partsN].life = 30.0f + (float)(rand() % 30);
        partsN++;
    }
}

static void spawnEnemy(void) {
    if (enemiesN >= 64) return;
    enemies[enemiesN].x = 40.0f + (float)rand() / (float)RAND_MAX * (W - 80);
    enemies[enemiesN].y = -30.0f;
    enemies[enemiesN].vx = ((float)rand() / (float)RAND_MAX - 0.5f) * 2.0f;
    enemies[enemiesN].vy = 0.7f + wave * 0.35f + (float)rand() / (float)RAND_MAX * 0.6f;
    enemies[enemiesN].r = 14.0f + (float)(rand() % 10);
    enemies[enemiesN].hp = 1 + wave / 2;
    enemies[enemiesN].t = rand() % 1000;
    enemiesN++;
}

static void resetGame(void) {
    score = 0; lives = 3; wave = 1; gameOver = 0; win = 0; shake = 0; tick = 0;
    shipX = W / 2.0f; shipVX = 0; fireCooldown = 0; enemySpawn = 0;
    boltsN = 0; enemiesN = 0; partsN = 0;
    enemiesLeftInWave = 8; enemiesKilledInWave = 0;
    initStars();
}

// one fixed-timestep simulation step (called at 60 Hz)
static void stepGame(int left, int right, int fire) {
    tick++;
    for (int i = 0; i < starsN; i++) {
        stars[i].y += stars[i].vy * (gameOver ? 0.3f : 1.0f);
        if (stars[i].y > H) { stars[i].y = 0; stars[i].x = (float)rand() / (float)RAND_MAX * W; }
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
        enemies[i].x += enemies[i].vx + sinf(enemies[i].t * 0.05f) * 0.6f;
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

// ============================================================================
//  WINDOWS BUILD — Win32 GDI renderer
// ============================================================================
#ifdef _WIN32
static HDC     g_memDC = NULL;
static HBITMAP g_bitmap = NULL;
static HBITMAP g_bg = NULL;         // pre-rendered nebula gradient
static HBRUSH  g_brStar = NULL, g_brBolt = NULL, g_brEnemy = NULL, g_brCore = NULL;
static HBRUSH  g_brShip = NULL, g_brCockpit = NULL, g_brFlame = NULL, g_brOutline = NULL;
static HBRUSH  g_brHudDim = NULL, g_brTextHud = NULL;
static HFONT   g_fontHud = NULL, g_fontBig = NULL, g_fontMed = NULL;
static int     g_keys[256];
static int     g_sx = 0, g_sy = 0;

static HBITMAP makeGradient(void) {
    BITMAPINFO bmi; memset(&bmi, 0, sizeof bmi);
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = W; bmi.bmiHeader.biHeight = -H;
    bmi.bmiHeader.biPlanes = 1; bmi.bmiHeader.biBitCount = 32; bmi.bmiHeader.biCompression = BI_RGB;
    void *bits = NULL;
    HDC tmp = CreateCompatibleDC(NULL);
    HBITMAP bmp = CreateDIBSection(tmp, &bmi, DIB_RGB_COLORS, &bits, NULL, 0);
    SelectObject(tmp, bmp);
    uint32_t *px = (uint32_t *)bits;
    for (int y = 0; y < H; y++) {
        float t = (float)y / H;
        int r = 4 + (int)(t * 10), g = 6 + (int)(t * 16), b = 20 + (int)(t * 40);
        for (int x = 0; x < W; x++) {
            float dx1 = (float)x - 180.0f, dy1 = (float)y - 110.0f; float d1 = sqrtf(dx1 * dx1 + dy1 * dy1);
            float dx2 = (float)x - 620.0f, dy2 = (float)y - 330.0f; float d2 = sqrtf(dx2 * dx2 + dy2 * dy2);
            int rr = r, gg = g, bb = b;
            if (d1 < 170) { float f = (170 - d1) / 170.0f * 0.5f; rr += (int)(90 * f); bb += (int)(60 * f); gg += (int)(20 * f); }
            if (d2 < 200) { float f = (200 - d2) / 200.0f * 0.5f; bb += (int)(80 * f); gg += (int)(50 * f); rr += (int)(10 * f); }
            px[y * W + x] = (uint32_t)((rr << 16) | (gg << 8) | bb);
        }
    }
    DeleteDC(tmp);
    return bmp;
}

static void fillPx(int x, int y, int w, int h, HBRUSH br) {
    RECT rc = { x, y, x + w, y + h };
    FillRect(g_memDC, &rc, br);
}

static void drawScene(void) {
    g_sx = shake ? ((rand() % (2 * shake)) - shake) : 0;
    g_sy = shake ? ((rand() % (2 * shake)) - shake) : 0;

    // background
    HDC bgDC = CreateCompatibleDC(g_memDC);
    HBITMAP oldBg = (HBITMAP)SelectObject(bgDC, g_bg);
    BitBlt(g_memDC, 0, 0, W, H, bgDC, 0, 0, SRCCOPY);
    SelectObject(bgDC, oldBg);
    DeleteDC(bgDC);

    // stars
    for (int i = 0; i < starsN; i++) {
        int x = (int)stars[i].x + g_sx, y = (int)stars[i].y + g_sy;
        int b2 = 140 + (int)(stars[i].vy * 60);
        HBRUSH br = CreateSolidBrush(RGB(b2, b2, b2));
        fillPx(x, y, 2, 2, br);
        if (stars[i].vy > 1.4f) fillPx(x, y + 4, 2, 5, br);
        DeleteObject(br);
    }

    // particles
    for (int i = 0; i < partsN; i++) {
        float a = parts[i].life / 60.0f; if (a > 1) a = 1; if (a < 0) a = 0;
        int c = (int)(255 * a);
        HBRUSH br = CreateSolidBrush(RGB(c, (int)(c * 0.62f), (int)(c * 0.25f)));
        fillPx((int)parts[i].x + g_sx, (int)parts[i].y + g_sy, 3, 3, br);
        DeleteObject(br);
    }

    // bolts
    for (int i = 0; i < boltsN; i++) fillPx((int)bolts[i].x - 2 + g_sx, (int)bolts[i].y - 6 + g_sy, 4, 12, g_brBolt);

    // enemies
    for (int i = 0; i < enemiesN; i++) {
        int ex = (int)enemies[i].x + g_sx, ey = (int)enemies[i].y + g_sy, er = (int)enemies[i].r;
        POINT pts[6] = { {ex, ey + er}, {ex - er, ey - er / 2}, {ex - er / 2, ey - er}, {ex, ey - er / 2}, {ex + er / 2, ey - er}, {ex + er, ey - er / 2} };
        HRGN rg = CreatePolygonRgn(pts, 6, WINDING);
        FillRgn(g_memDC, rg, g_brEnemy);
        DeleteObject(rg);
        HBRUSH oldCore = (HBRUSH)SelectObject(g_memDC, g_brCockpit);
        Ellipse(g_memDC, ex - 4, ey - 4, ex + 4, ey + 4); // cockpit glow
        SelectObject(g_memDC, oldCore);
        HPEN pen = CreatePen(PS_SOLID, 1, RGB(255, 120, 120));
        HPEN oldPen = (HPEN)SelectObject(g_memDC, pen);
        HBRUSH oldBr = (HBRUSH)SelectObject(g_memDC, GetStockObject(NULL_BRUSH));
        Ellipse(g_memDC, ex - er, ey - er, ex + er, ey + er);
        SelectObject(g_memDC, oldPen); SelectObject(g_memDC, oldBr);
        DeleteObject(pen);
    }

    // ship
    if (!gameOver || lives > 0) {
        int px = (int)shipX + g_sx, py = (int)shipY + g_sy;
        POINT pts[6] = { {px, py - 22}, {px - 18, py + 16}, {px - 8, py + 8}, {px, py + 14}, {px + 8, py + 8}, {px + 18, py + 16} };
        HRGN rg = CreatePolygonRgn(pts, 6, WINDING);
        FillRgn(g_memDC, rg, g_brShip);
        DeleteObject(rg);
        HBRUSH oldBr = (HBRUSH)SelectObject(g_memDC, g_brCockpit);
        Ellipse(g_memDC, px - 4, py - 10, px + 4, py + 2);
        SelectObject(g_memDC, oldBr);
        POINT fpts[3] = { {px - 5, py + 16}, {px + 5, py + 16}, {px, py + 24 + rand() % 8} };
        HRGN freg = CreatePolygonRgn(fpts, 3, WINDING);
        FillRgn(g_memDC, freg, g_brFlame);
        DeleteObject(freg);
    }

    // HUD
    SetBkMode(g_memDC, TRANSPARENT);
    SelectObject(g_memDC, g_fontHud);
    SetTextColor(g_memDC, RGB(150, 230, 255));
    char hud[128];
    sprintf(hud, "SCORE %06d    WAVE %d/5    LIVES %d", score, wave, lives);
    TextOutA(g_memDC, 16, 12, hud, (int)strlen(hud));
    SetTextColor(g_memDC, RGB(255, 210, 120));
    TextOutA(g_memDC, W - 190, 12, "NEBULA STRIKE", 13);
    SetTextColor(g_memDC, RGB(120, 160, 210));
    TextOutA(g_memDC, 16, H - 24, "[ARROWS] move   [SPACE] fire   [ESC] quit", 42);

    if (gameOver) {
        RECT full = { 0, 0, W, H };
        FillRect(g_memDC, &full, g_brHudDim);
        SelectObject(g_memDC, g_fontBig);
        SetTextColor(g_memDC, win ? RGB(120, 255, 160) : RGB(255, 90, 90));
        const char *t = win ? "VICTORY!" : "GAME OVER";
        TextOutA(g_memDC, W / 2 - (int)strlen(t) * 14, H / 2 - 70, t, (int)strlen(t));
        SelectObject(g_memDC, g_fontMed);
        SetTextColor(g_memDC, RGB(220, 230, 255));
        char sc[64];
        sprintf(sc, "FINAL SCORE: %d", score);
        TextOutA(g_memDC, W / 2 - 130, H / 2 + 5, sc, (int)strlen(sc));
        SetTextColor(g_memDC, RGB(150, 200, 255));
        TextOutA(g_memDC, W / 2 - 155, H / 2 + 45, "Press R to fly again", 20);
    }
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_KEYDOWN: g_keys[wParam & 0xFF] = 1; if (wParam == VK_ESCAPE) DestroyWindow(hwnd); if (wParam == 'R' && gameOver) resetGame(); return 0;
        case WM_KEYUP:   g_keys[wParam & 0xFF] = 0; return 0;
        case WM_DESTROY: PostQuitMessage(0); return 0;
        case WM_PAINT: {
            PAINTSTRUCT ps; HDC hdc = BeginPaint(hwnd, &ps);
            RECT rc; GetClientRect(hwnd, &rc);
            StretchBlt(hdc, 0, 0, rc.right, rc.bottom, g_memDC, 0, 0, W, H, SRCCOPY);
            EndPaint(hwnd, &ps); return 0;
        }
    }
    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrev, LPSTR lpCmd, int nShow) {
    (void)hPrev; (void)lpCmd;
    srand((unsigned)time(NULL));
    resetGame();

    WNDCLASSA wc; memset(&wc, 0, sizeof wc);
    wc.lpfnWndProc = WndProc; wc.hInstance = hInst; wc.lpszClassName = "NebulaStrikeClass";
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    RegisterClassA(&wc);

    RECT rc = { 0, 0, W, H };
    AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME, FALSE);
    HWND hwnd = CreateWindowA("NebulaStrikeClass", "NEBULA STRIKE — Big Pickle Studios",
        (WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME) | WS_VISIBLE,
        CW_USEDEFAULT, CW_USEDEFAULT, rc.right - rc.left, rc.bottom - rc.top,
        NULL, NULL, hInst, NULL);
    if (!hwnd) return 1;

    g_memDC = CreateCompatibleDC(NULL);
    BITMAPINFO bmi; memset(&bmi, 0, sizeof bmi);
    bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth = W; bmi.bmiHeader.biHeight = -H;
    bmi.bmiHeader.biPlanes = 1; bmi.bmiHeader.biBitCount = 32; bmi.bmiHeader.biCompression = BI_RGB;
    g_bitmap = CreateDIBSection(g_memDC, &bmi, DIB_RGB_COLORS, NULL, NULL, 0);
    SelectObject(g_memDC, g_bitmap);

    g_bg = makeGradient();
    g_brBolt = CreateSolidBrush(RGB(120, 240, 255));
    g_brEnemy = CreateSolidBrush(RGB(210, 60, 70));
    g_brShip = CreateSolidBrush(RGB(70, 180, 255));
    g_brCockpit = CreateSolidBrush(RGB(180, 240, 255));
    g_brFlame = CreateSolidBrush(RGB(255, 160, 40));
    g_brHudDim = CreateSolidBrush(RGB(8, 10, 24));
    g_fontHud = CreateFontA(17, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Consolas");
    g_fontBig = CreateFontA(46, 0, 0, 0, FW_HEAVY, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Impact");
    g_fontMed = CreateFontA(20, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, "Consolas");

    ShowWindow(hwnd, nShow); UpdateWindow(hwnd);

    LARGE_INTEGER freq, last, now;
    QueryPerformanceFrequency(&freq); QueryPerformanceCounter(&last);
    double acc = 0.0; const double STEP = 1.0 / 60.0;
    MSG msg; int running = 1;
    while (running) {
        while (PeekMessageA(&msg, NULL, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) running = 0;
            TranslateMessage(&msg); DispatchMessageA(&msg);
        }
        QueryPerformanceCounter(&now);
        acc += (double)(now.QuadPart - last.QuadPart) / (double)freq.QuadPart;
        last = now;
        int steps = 0;
        while (acc >= STEP && steps < 5) {
            stepGame(g_keys[VK_LEFT] || g_keys['A'], g_keys[VK_RIGHT] || g_keys['D'], g_keys[VK_SPACE] || g_keys[VK_UP] || g_keys['W']);
            acc -= STEP; steps++;
        }
        drawScene();
        InvalidateRect(hwnd, NULL, FALSE);
        UpdateWindow(hwnd);
        Sleep(1);
    }
    return 0;
}
#endif // _WIN32

// ============================================================================
//  WASM BUILD — headless benchmark + autotest mode (WASI)
// ============================================================================
#ifndef _WIN32
int main(void) {
    srand(1337); // deterministic
    resetGame();
    int frames = 0;
    const int MAX_FRAMES = 60 * 180; // 3 minutes max
    clock_t start = clock();
    while (!gameOver && frames < MAX_FRAMES) {
        // AI pilot: chase nearest enemy, dodge when too close
        int left = 0, right = 0, fire = 1;
        float best = 1e9f; float tx = W / 2.0f; int found = 0;
        for (int i = 0; i < enemiesN; i++) {
            float d = enemies[i].x - shipX; if (d < 0) d = -d;
            if (d < best) { best = d; tx = enemies[i].x; found = 1; }
        }
        if (found) { if (tx < shipX - 8) left = 1; else if (tx > shipX + 8) right = 1; }
        stepGame(left, right, fire);
        frames++;
    }
    double secs = (double)(clock() - start) / (double)CLOCKS_PER_SEC;

    clock_t b0 = clock();
    int benchFrames = 0;
    resetGame();
    while (benchFrames < 3600) { // 60 simulated seconds of game logic
        stepGame((benchFrames % 120) < 60, (benchFrames % 120) >= 60, 1);
        benchFrames++;
    }
    double benchSecs = (double)(clock() - b0) / (double)CLOCKS_PER_SEC;
    double logicFps = benchSecs > 0 ? benchFrames / benchSecs : (double)benchFrames;

    printf("{\n");
    printf("  \"game\": \"Nebula Strike\",\n");
    printf("  \"studio\": \"Big Pickle Studios\",\n");
    printf("  \"target\": \"wasm\",\n");
    printf("  \"pointer_bits\": %d,\n", (int)(sizeof(void *) * 8));
    printf("  \"autotest\": {\n");
    printf("    \"result\": \"%s\",\n", win ? "WIN" : (lives <= 0 ? "DEFEAT" : "TIMEOUT"));
    printf("    \"score\": %d,\n", score);
    printf("    \"wave_reached\": %d,\n", wave);
    printf("    \"frames_simulated\": %d,\n", frames);
    printf("    \"lives_left\": %d,\n", lives);
    printf("    \"wall_seconds\": %.4f\n", secs);
    printf("  },\n");
    printf("  \"benchmark\": {\n");
    printf("    \"simulated_seconds\": 60,\n");
    printf("    \"frames\": %d,\n", benchFrames);
    printf("    \"wall_seconds\": %.4f,\n", benchSecs);
    printf("    \"logic_fps\": %.1f\n", logicFps);
    printf("  }\n");
    printf("}\n");
    return 0;
}
#endif
