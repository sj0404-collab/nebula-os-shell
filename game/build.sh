#!/bin/sh
# NEBULA STRIKE — cross-platform build (requires zig 0.17+)
set -e
zig cc -target x86_64-windows-gnu -O2 -Wl,--subsystem,windows nebula_windows.c -o NebulaStrike.exe -lgdi32 -luser32
zig cc -target wasm64-wasi -O3 -nostdlib -Wl,--no-entry nebula_wasm64.c -o nebula_strike_wasm64.wasm
zig cc -target wasm32-wasi -O3 nebula_wasm32.c -o nebula_strike_wasm32.wasm
echo "Artifacts: NebulaStrike.exe  nebula_strike_wasm64.wasm  nebula_strike_wasm32.wasm"
