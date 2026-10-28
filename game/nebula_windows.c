// ============================================================================
//  NEBULA STRIKE — Windows x86_64 EXE (Win32 GDI software renderer)
// ============================================================================
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <stdint.h>
#include <windows.h>

#define W 800
#define H 450

#include "nebula_core.inc"

static HDC     g_memDC = NULL;
static HBITMAP g_bitmap = NULL;
static HBITMAP g_bg = NULL;
static HBRUSH  g_brBolt = NULL, g_brEnemy = NULL, g_brShip = NULL;
static HBRUSH  g_brCockpit = NULL, g_brFlame = NULL, g_brHudDim = NULL;
static HFONT   g_fontHud = NULL, g_fontBig = NULL, g_fontMed = NULL;
static int     g_keys[256];
static int     g_sx = 0, g_sy = 0;

static float fsqrt_w(float x){ return fsqrt(x); }

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
            float dx1 = (float)x - 180.0f, dy1 = (float)y - 110.0f; float d1 = fsqrt(dx1 * dx1 + dy1 * dy1);
            float dx2 = (float)x - 620.0f, dy2 = (float)y - 330.0f; float d2 = fsqrt(dx2 * dx2 + dy2 * dy2);
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
    g_sx = shake ? ((frandInt(2 * shake)) - shake) : 0;
    g_sy = shake ? ((frandInt(2 * shake)) - shake) : 0;

    HDC bgDC = CreateCompatibleDC(g_memDC);
    HBITMAP oldBg = (HBITMAP)SelectObject(bgDC, g_bg);
    BitBlt(g_memDC, 0, 0, W, H, bgDC, 0, 0, SRCCOPY);
    SelectObject(bgDC, oldBg);
    DeleteDC(bgDC);

    for (int i = 0; i < starsN; i++) {
        int x = (int)stars[i].x + g_sx, y = (int)stars[i].y + g_sy;
        int b2 = 140 + (int)(stars[i].vy * 60);
        HBRUSH br = CreateSolidBrush(RGB(b2, b2, b2));
        fillPx(x, y, 2, 2, br);
        if (stars[i].vy > 1.4f) fillPx(x, y + 4, 2, 5, br);
        DeleteObject(br);
    }

    for (int i = 0; i < partsN; i++) {
        float a = parts[i].life / 60.0f; if (a > 1) a = 1; if (a < 0) a = 0;
        int c = (int)(255 * a);
        HBRUSH br = CreateSolidBrush(RGB(c, (int)(c * 0.62f), (int)(c * 0.25f)));
        fillPx((int)parts[i].x + g_sx, (int)parts[i].y + g_sy, 3, 3, br);
        DeleteObject(br);
    }

    for (int i = 0; i < boltsN; i++) fillPx((int)bolts[i].x - 2 + g_sx, (int)bolts[i].y - 6 + g_sy, 4, 12, g_brBolt);

    for (int i = 0; i < enemiesN; i++) {
        int ex = (int)enemies[i].x + g_sx, ey = (int)enemies[i].y + g_sy, er = (int)enemies[i].r;
        POINT pts[6] = { {ex, ey + er}, {ex - er, ey - er / 2}, {ex - er / 2, ey - er}, {ex, ey - er / 2}, {ex + er / 2, ey - er}, {ex + er, ey - er / 2} };
        HRGN rg = CreatePolygonRgn(pts, 6, WINDING);
        FillRgn(g_memDC, rg, g_brEnemy);
        DeleteObject(rg);
        HBRUSH oldCore = (HBRUSH)SelectObject(g_memDC, g_brCockpit);
        Ellipse(g_memDC, ex - 4, ey - 4, ex + 4, ey + 4);
        SelectObject(g_memDC, oldCore);
        HPEN pen = CreatePen(PS_SOLID, 1, RGB(255, 120, 120));
        HPEN oldPen = (HPEN)SelectObject(g_memDC, pen);
        HBRUSH oldBr = (HBRUSH)SelectObject(g_memDC, (HBRUSH)GetStockObject(NULL_BRUSH));
        Ellipse(g_memDC, ex - er, ey - er, ex + er, ey + er);
        SelectObject(g_memDC, oldPen); SelectObject(g_memDC, oldBr);
        DeleteObject(pen);
    }

    if (!gameOver || lives > 0) {
        int px = (int)shipX + g_sx, py = (int)shipY + g_sy;
        POINT pts[6] = { {px, py - 22}, {px - 18, py + 16}, {px - 8, py + 8}, {px, py + 14}, {px + 8, py + 8}, {px + 18, py + 16} };
        HRGN rg = CreatePolygonRgn(pts, 6, WINDING);
        FillRgn(g_memDC, rg, g_brShip);
        DeleteObject(rg);
        HBRUSH oldBr = (HBRUSH)SelectObject(g_memDC, g_brCockpit);
        Ellipse(g_memDC, px - 4, py - 10, px + 4, py + 2);
        SelectObject(g_memDC, oldBr);
        POINT fpts[3] = { {px - 5, py + 16}, {px + 5, py + 16}, {px, py + 24 + frandInt(8)} };
        HRGN freg = CreatePolygonRgn(fpts, 3, WINDING);
        FillRgn(g_memDC, freg, g_brFlame);
        DeleteObject(freg);
    }

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
        case WM_KEYDOWN:
            g_keys[wParam & 0xFF] = 1;
            if (wParam == VK_ESCAPE) DestroyWindow(hwnd);
            if (wParam == 'R' && gameOver) { srand_((unsigned long long)time(NULL)); resetGame(); }
            return 0;
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
    srand_((unsigned long long)time(NULL));
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
    DeleteObject(g_fontHud); DeleteObject(g_fontBig); DeleteObject(g_fontMed);
    DeleteObject(g_brBolt); DeleteObject(g_brEnemy); DeleteObject(g_brShip);
    DeleteObject(g_brCockpit); DeleteObject(g_brFlame); DeleteObject(g_brHudDim);
    DeleteObject(g_bg); DeleteObject(g_bitmap); DeleteDC(g_memDC);
    return 0;
}
