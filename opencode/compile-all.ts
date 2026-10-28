// bun run opencode/compile-all.ts — builds single-file bridge executables for every desktop platform.
import { mkdirSync } from 'node:fs';
const targets = [
  ['bun-linux-x64', 'opencode-bridge-linux-x64'],
  ['bun-linux-arm64', 'opencode-bridge-linux-arm64'],
  ['bun-darwin-arm64', 'opencode-bridge-macos-arm64'],
  ['bun-darwin-x64', 'opencode-bridge-macos-x64'],
  ['bun-windows-x64', 'opencode-bridge-windows-x64.exe'],
] as const;
mkdirSync('release', { recursive: true });
const only = process.argv.slice(2);
for (const [target, out] of targets) {
  if (only.length && !only.some(o => target.includes(o))) continue;
  const p = Bun.spawnSync(['bun', 'build', '--compile', `--target=${target}`, 'opencode/bridge.ts', '--outfile', `release/${out}`], { stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) { console.error(`✗ ${target}`); process.exit(1); }
  console.log(`✓ release/${out}`);
}
