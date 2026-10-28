// ============================================================================
//  NEBULA STRIKE — wasm64 build (Memory64)
//  True 64-bit WASM: 64-bit linear memory, 64-bit pointers & size_t.
//  Freestanding (no libc) — game core compiled pure. The host (browser)
//  drives the frame loop via exported stepGame(); state is exposed for HUD.
// ============================================================================
#define W 800
#define H 450
typedef unsigned long size_t64;

#include "nebula_core.inc"

// ---- exported ABI ------------------------------------------------------------
__attribute__((export_name("nebula_ptr_bits")))    size_t64 nebula_ptr_bits(void)    { return sizeof(void *) * 8; }
__attribute__((export_name("nebula_size_bits")))   size_t64 nebula_size_bits(void)   { return sizeof(size_t64) * 8; }
__attribute__((export_name("nebula_pointer_max"))) size_t64 nebula_pointer_max(void) { return (size_t64)-1; }

__attribute__((export_name("nebula_reset"))) void nebula_reset(void) { srand_(1337); resetGame(); }
__attribute__((export_name("nebula_step")))  void nebula_step(int left, int right, int fire) { stepGame(left, right, fire); }

__attribute__((export_name("nebula_score")))     int nebula_score(void)     { return score; }
__attribute__((export_name("nebula_lives")))     int nebula_lives(void)     { return lives; }
__attribute__((export_name("nebula_wave")))      int nebula_wave(void)      { return wave; }
__attribute__((export_name("nebula_gameover")))  int nebula_gameover(void)  { return gameOver; }
__attribute__((export_name("nebula_win")))       int nebula_win(void)       { return win; }
__attribute__((export_name("nebula_ship_x")))    float nebula_ship_x(void)  { return shipX; }
__attribute__((export_name("nebula_ship_vx")))   float nebula_ship_vx(void) { return shipVX; }
__attribute__((export_name("nebula_tick")))      int nebula_tick(void)      { return tick; }
__attribute__((export_name("nebula_shake")))     int nebula_shake(void)     { return shake; }

// entity pools — flat array reads for the WebGL/Canvas renderer
__attribute__((export_name("nebula_stars_ptr")))   size_t64 nebula_stars_ptr(void)   { return (size_t64)stars; }
__attribute__((export_name("nebula_stars_count"))) int nebula_stars_count(void)      { return starsN; }
__attribute__((export_name("nebula_bolts_ptr")))   size_t64 nebula_bolts_ptr(void)   { return (size_t64)bolts; }
__attribute__((export_name("nebula_bolts_count"))) int nebula_bolts_count(void)      { return boltsN; }
__attribute__((export_name("nebula_enemies_ptr"))) size_t64 nebula_enemies_ptr(void) { return (size_t64)enemies; }
__attribute__((export_name("nebula_enemies_count"))) int nebula_enemies_count(void)  { return enemiesN; }
__attribute__((export_name("nebula_parts_ptr")))   size_t64 nebula_parts_ptr(void)   { return (size_t64)parts; }
__attribute__((export_name("nebula_parts_count"))) int nebula_parts_count(void)      { return partsN; }

// headless AI autotest — full playthrough + benchmark, results in globals
static int g_autoScore = 0, g_autoWave = 0, g_autoFrames = 0, g_autoLives = 0, g_autoWin = 0;
__attribute__((export_name("nebula_autotest"))) int nebula_autotest(void) {
    srand_(1337); resetGame();
    int frames = 0;
    const int MAX_FRAMES = 60 * 180;
    while (!gameOver && frames < MAX_FRAMES) {
        int left, right, fire; aiPilot(&left, &right, &fire);
        stepGame(left, right, fire);
        frames++;
    }
    g_autoScore = score; g_autoWave = wave; g_autoFrames = frames; g_autoLives = lives; g_autoWin = win;
    return frames;
}
__attribute__((export_name("nebula_auto_score")))  int nebula_auto_score(void)  { return g_autoScore; }
__attribute__((export_name("nebula_auto_wave")))   int nebula_auto_wave(void)   { return g_autoWave; }
__attribute__((export_name("nebula_auto_frames"))) int nebula_auto_frames(void) { return g_autoFrames; }
__attribute__((export_name("nebula_auto_lives")))  int nebula_auto_lives(void)  { return g_autoLives; }
__attribute__((export_name("nebula_auto_win")))    int nebula_auto_win(void)    { return g_autoWin; }

// 60 simulated seconds of logic — returns frames per millisecond x1000 (i.e. logic fps)
__attribute__((export_name("nebula_bench"))) int nebula_bench(void) {
    srand_(1337); resetGame();
    const int BENCH = 3600;
    for (int i = 0; i < BENCH; i++) stepGame((i % 120) < 60, (i % 120) >= 60, 1);
    return BENCH; // host measures wall time around this call for real fps
}

void _start(void) {}
