# NEBULA STRIKE — Big Pickle Studios

Cross-platform native build of the Big Pickle Studios arcade space shooter.

| Artifact | Target | Description |
|---|---|---|
| NebulaStrike.exe | `x86_64-windows-gnu` (Win32 + GDI) | Native Windows 10 x64 binary, software-rendered |
| nebula_strike_wasm64.wasm | `wasm64-wasi` (Memory64) | True 64-bit WASM module, 64-bit pointers/size_t |
| nebula_strike_wasm32.wasm | `wasm32-wasi` (MVP + WASI) | 32-bit WASM with WASI preview1 |

## Controls
- Left/Right arrows or A/D — move
- Space / Up / W — fire
- R — restart after game over
- Esc — quit

## Build (zig 0.17+ / ziglang pip)
```
python3 -m ziglang cc -target x86_64-windows-gnu -O2 -Wl,--subsystem,windows game/nebula_windows.c -o NebulaStrike.exe -lgdi32 -luser32
python3 -m ziglang cc -target wasm64-wasi -O3 -nostdlib -Wl,--no-entry game/nebula_wasm64.c -o nebula_strike_wasm64.wasm
python3 -m ziglang cc -target wasm32-wasi -O3 game/nebula_wasm32.c -o nebula_strike_wasm32.wasm
```

## Autotest (headless AI pilot, deterministic seed 1337)
See test_results.json — both WASM binaries agree exactly:
WIN / score 7500 / wave 5/5 / 2563 frames / 3 lives left.

## Files
- nebula_core.inc — shared deterministic game core (freestanding math, xoro64 RNG)
- nebula_wasm64.c — Memory64 wrapper (exported ABI for the browser host)
- nebula_wasm32.c — WASI CLI autotest + benchmark
- nebula_windows.c — WinMain + GDI renderer + fixed timestep loop
