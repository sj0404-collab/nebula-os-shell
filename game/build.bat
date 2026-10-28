@echo off
REM NEBULA STRIKE — Windows build script (requires zig 0.17+)
zig cc -target x86_64-windows-gnu -O2 -Wl,--subsystem,windows nebula_windows.c -o NebulaStrike.exe -lgdi32 -luser32
echo Done: NebulaStrike.exe
