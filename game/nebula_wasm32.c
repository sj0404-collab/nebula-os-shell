// ============================================================================
//  NEBULA STRIKE — wasm32 build (MVP WASM + WASI, same game core)
// ============================================================================
#include <stdio.h>

#define W 800
#define H 450

#include "nebula_core.inc"

int main(void) {
    srand_(1337); // deterministic
    resetGame();

    int frames = 0;
    const int MAX_FRAMES = 60 * 180;
    while (!gameOver && frames < MAX_FRAMES) {
        int left, right, fire; aiPilot(&left, &right, &fire);
        stepGame(left, right, fire);
        frames++;
    }
    int autoScore = score, autoWave = wave, autoLives = lives, autoWin = win;

    const int BENCH = 3600;
    resetGame();
    for (int i = 0; i < BENCH; i++) stepGame((i % 120) < 60, (i % 120) >= 60, 1);
    int benchChecksum = score + tick + (int)shipX; // prevents dead-code elimination

    printf("{\n");
    printf("  \"game\": \"Nebula Strike\",\n");
    printf("  \"studio\": \"Big Pickle Studios\",\n");
    printf("  \"target\": \"wasm32-wasi\",\n");
    printf("  \"pointer_bits\": %d,\n", (int)(sizeof(void *) * 8));
    printf("  \"autotest\": {\n");
    printf("    \"result\": \"%s\",\n", autoWin ? "WIN" : (autoLives <= 0 ? "DEFEAT" : "TIMEOUT"));
    printf("    \"score\": %d,\n", autoScore);
    printf("    \"wave_reached\": %d,\n", autoWave);
    printf("    \"frames_simulated\": %d,\n", frames);
    printf("    \"lives_left\": %d\n", autoLives);
    printf("  },\n");
    printf("  \"benchmark\": {\n");
    printf("    \"simulated_seconds\": 60,\n");
    printf("    \"frames\": %d,\n", BENCH);
    printf("    \"checksum\": %d\n", benchChecksum);
    printf("  }\n");
    printf("}\n");
    return 0;
}
