#!/usr/bin/env node
/**
 * End-to-end tests for the Nebula OS shell (Playwright, headless Chromium).
 *
 *   npm run test:e2e                       # builds nothing — expects ./dist (run `npm run build` first)
 *   E2E_URL=http://localhost:5173 node e2e/run.mjs   # test an already running server
 *   E2E_BRIDGE=1  → also require the REAL opencode bridge (/api/opencode) and a real model answer
 *
 * Works on Windows / macOS / Linux (spawns `vite preview` via npx when E2E_URL is not set).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 4199;
const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = resolve(ROOT, 'e2e', 'shots');
mkdirSync(SHOTS, { recursive: true });

let url = process.env.E2E_URL;
let server = null;
if (!url) {
  url = `http://127.0.0.1:${PORT}`;
  server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32', detached: process.platform !== 'win32',
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 30_000) {
    try { const r = await fetch(url); if (r.ok) break; } catch { /* wait */ }
    await new Promise(r => setTimeout(r, 300));
  }
}

const results = [];
let page;
const errors = [];
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`  ✓ ${name} (${Date.now() - t} ms)`); }
  catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: String(e.message ?? e).split('\n')[0] });
    console.log(`  ✗ ${name}\n      ${String(e.message ?? e).split('\n').slice(0, 3).join('\n      ')}`);
    try { await page?.screenshot({ path: resolve(SHOTS, `fail-${name.replace(/[^a-z0-9]+/gi, '_')}.png`) }); } catch { /* ignore */ }
    try { await closeAll(); } catch { /* ignore */ }
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|designarena|rrweb|Failed to load resource/i.test(m.text())) errors.push(`console: ${m.text()}`); });

const win = (title) => page.locator(`[aria-label="${title}"]`);
const windowsCount = () => page.locator('[data-window]').count();
const ICON = { 'This PC': 'pc', 'Recycle Bin': 'recycle', 'Nebula Strike': 'game', 'Steam': 'steam', 'Epic Games': 'epic', 'Command Prompt': 'terminal', 'opencode': 'opencode', 'Microsoft Edge': 'edge' };
const iconOf = (p, label) => p.locator(`[data-desktop-icon="${ICON[label]}"]`);
const openFromDesktop = async (label) => { await iconOf(page, label).dblclick(); await sleep(300); };
const closeAll = async () => {
  for (let i = 0; i < 20; i++) {
    const b = page.locator('[aria-label="Close"]').first();
    if (!(await b.count())) break;
    await b.click({ force: true }); await sleep(120);
  }
};

console.log(`\nNebula OS e2e → ${url}\n`);

await test('desktop loads with 8 icons, taskbar, no page errors', async () => {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[aria-label="Start"]');
  for (const l of Object.keys(ICON))
    expect(await iconOf(page, l).count() === 1, `icon "${l}" missing`);
  await page.screenshot({ path: resolve(SHOTS, 'desktop.png') });
});

await test('double-click opens exactly ONE window (no click+dblclick duplicate)', async () => {
  await openFromDesktop('Steam');
  expect((await windowsCount()) === 1, `expected 1 window, got ${await windowsCount()}`);
  await closeAll();
  expect((await windowsCount()) === 0, 'window did not close');
});

await test('single click selects icon but does not open', async () => {
  await iconOf(page, 'Steam').click();
  await sleep(300);
  expect((await windowsCount()) === 0, 'single click should not open a window');
});

await test('single-instance apps focus the existing window instead of duplicating', async () => {
  await openFromDesktop('Steam'); await openFromDesktop('Steam');
  expect((await windowsCount()) === 1, `Steam duplicated: ${await windowsCount()}`);
  await closeAll();
});

await test('every app opens, renders and closes', async () => {
  const apps = [['This PC', 'File Explorer'], ['Nebula Strike', 'NEBULA STRIKE'], ['Steam', 'Steam'], ['Epic Games', 'Epic Games Launcher'],
    ['Command Prompt', 'Command Prompt'], ['opencode', 'opencode'], ['Microsoft Edge', 'Microsoft Edge']];
  for (const [label, title] of apps) {
    await openFromDesktop(label);
    const w = page.locator(`[data-window][aria-label*="${title}"]`);
    expect(await w.count() === 1, `window "${title}" not found after opening ${label}`);
    const box = await w.boundingBox();
    expect(box && box.width > 300 && box.height > 200, `window "${title}" has no size`);
    await page.screenshot({ path: resolve(SHOTS, `app-${label.replace(/\s+/g, '_')}.png`) });
    await closeAll();
  }
  expect((await windowsCount()) === 0, 'windows left open');
});

await test('window controls: minimize → taskbar restore, maximize fills screen', async () => {
  await openFromDesktop('Steam');
  const w = page.locator('[data-window="steam"]');
  await w.locator('[aria-label="Maximize"]').click(); await sleep(250);
  const b = await w.boundingBox();
  expect(b.width >= 1390 && b.height >= 800, `maximized size ${b.width}x${b.height}`);
  await w.locator('[aria-label="Minimize"]').click(); await sleep(250);
  expect(!(await w.isVisible()), 'window still visible after minimize');
  await page.locator('[data-taskbar] button[title="steam" i]').first().click(); await sleep(250);
  expect(await w.isVisible(), 'window not restored from taskbar');
  await closeAll();
});

await test('window drag moves it', async () => {
  await openFromDesktop('Steam');
  const w = page.locator('[data-window="steam"]');
  const before = await w.boundingBox();
  const bar = w.locator('[data-titlebar]').first();
  const bb = await bar.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 150, bb.y + bb.height / 2 + 90, { steps: 8 }); await page.mouse.up();
  const after = await w.boundingBox();
  expect(Math.abs(after.x - before.x - 150) < 6 && Math.abs(after.y - before.y - 90) < 6, `moved by ${after.x - before.x},${after.y - before.y}`);
  await closeAll();
});

await test('start menu opens apps and closes on launch', async () => {
  await page.locator('[aria-label="Start"]').click(); await sleep(250);
  const notepad = page.getByRole('button', { name: /notepad/i }).first();
  expect(await notepad.count() === 1, 'Notepad not in start menu');
  await notepad.click(); await sleep(300);
  expect((await windowsCount()) === 1, 'Notepad did not open');
  expect(!(await page.locator('[data-startmenu]').isVisible().catch(() => false)), 'start menu should close after launch');
  await closeAll();
});

await test('terminal: help / dir / ver / echo / cd / opencode command', async () => {
  await openFromDesktop('Command Prompt');
  const term = page.locator('[data-window="terminal"]');
  const input = term.locator('input').first();
  const run = async (cmd) => { await input.fill(cmd); await input.press('Enter'); await sleep(250); return term.innerText(); };
  expect((await run('ver')).includes('Microsoft Windows [Version 10.0.19045'), 'ver output');
  expect(/<DIR>\s+Downloads/.test(await run('dir')), 'dir output lacks <DIR> Downloads');
  expect(/NebulaStrike\.exe/.test(await run('dir Downloads')), 'dir Downloads lacks NebulaStrike.exe');
  expect((await run('echo hello e2e')).includes('hello e2e'), 'echo output');
  expect((await run('help')).toLowerCase().includes('opencode'), 'help mentions opencode');
  const t = await run('cd ..');
  expect(!/not recognized|error/i.test(t.split('\n').slice(-3).join('\n')), 'cd .. errored');
  await run('opencode');
  expect((await windowsCount()) === 2, '`opencode` command should open the TUI window');
  await closeAll();
});

await test('Nebula Strike: wasm32 autotest reaches WIN · 7500', async () => {
  await openFromDesktop('Nebula Strike');
  const w = page.locator('[data-window="nebula"]');
  await w.getByRole('button', { name: /autotest/i }).click();
  await page.waitForFunction(() => /WIN · score \d+/.test(document.body.innerText), null, { timeout: 60_000 });
  const txt = await w.innerText();
  const m = txt.match(/(WIN|DEFEAT) · score (\d+) · wave (\d+)\/5/);
  expect(m && m[1] === 'WIN' && Number(m[2]) >= 7000, `autotest result: ${m?.[0]}`);
  await page.screenshot({ path: resolve(SHOTS, 'nebula-autotest.png') });
  await closeAll();
});

await test('Nebula Strike: keyboard moves the ship and canvas renders', async () => {
  await openFromDesktop('Nebula Strike');
  const w = page.locator('[data-window="nebula"]');
  const canvas = w.locator('canvas').first();
  expect(await canvas.count() === 1, 'no canvas');
  await canvas.click();
  await page.keyboard.down('ArrowLeft'); await sleep(500); await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  const nonBlack = await canvas.evaluate(c => { const g = c.getContext('2d'); if (!g) return -1; const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; });
  expect(nonBlack !== 0, 'canvas is blank');
  await closeAll();
});

await test('opencode window: DEMO mode when bridge is offline', async () => {
  const c2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p2 = await c2.newPage();
  await p2.route('**/api/opencode/**', r => r.abort());
  await p2.goto(url, { waitUntil: 'load' });
  await iconOf(p2, 'opencode').dblclick();
  await p2.waitForSelector('text=demo · bridge offline', { timeout: 10_000 });
  await p2.waitForFunction(() => /WIN|autotest|7500/.test(document.body.innerText), null, { timeout: 30_000 });
  const input = p2.locator('[data-window="opencode"] input').last();
  await input.fill('fps'); await input.press('Enter'); await sleep(800);
  expect(/fps/i.test(await p2.locator('[data-window="opencode"]').innerText()), 'demo answer missing');
  await p2.screenshot({ path: resolve(SHOTS, 'opencode-demo.png') });
  await c2.close();
});

const bridgeUp = await fetch(`${url}/api/opencode/bridge`).then(r => r.ok).catch(() => false);
if (bridgeUp || process.env.E2E_BRIDGE) {
  await test('opencode window: LIVE mode — real agent answers and runs a tool', async () => {
    await openFromDesktop('opencode');
    await page.waitForSelector('text=live · v', { timeout: 15_000 });
    const oc = page.locator('[data-window="opencode"]');
    const input = oc.locator('input').last();
    await input.fill('Reply with exactly the two words: PICKLE LIVE, then run `ls opencode` with your bash tool.');
    await input.press('Enter');
    await page.waitForFunction(() => document.body.innerText.includes('PICKLE LIVE') && !document.querySelector('input[placeholder*="working"]'), null, { timeout: 120_000 });
    const txt = await oc.innerText();
    expect(/bridge\.ts/.test(txt), 'tool output (ls opencode) not rendered');
    expect(/tokens/.test(txt), 'token counter missing');
    await page.screenshot({ path: resolve(SHOTS, 'opencode-live.png') });
    await closeAll();
  });
} else {
  console.log('  – opencode LIVE test skipped (bridge not running; start `npm run opencode`)');
}

await test('responsive: 390×844 phone viewport still shows taskbar + icons and opens an app', async () => {
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p3 = await c3.newPage();
  await p3.goto(url, { waitUntil: 'load' });
  await p3.waitForSelector('[aria-label="Start"]');
  await iconOf(p3, 'Steam').tap();
  await sleep(400);
  const w = p3.locator('[data-window]').first();
  expect(await w.count() === 1, 'tap did not open the app on touch device');
  const b = await w.boundingBox();
  expect(b.x >= 0 && b.x + b.width <= 392, `window overflows phone screen (${b.x}+${b.width})`);
  await p3.screenshot({ path: resolve(SHOTS, 'phone.png') });
  await c3.close();
});

await test('PWA: manifest, icons and service worker are served', async () => {
  const m = await (await fetch(`${url}/manifest.webmanifest`)).json();
  expect(m.name && m.icons?.length >= 3 && m.display === 'standalone', 'manifest incomplete');
  for (const i of m.icons) expect((await fetch(`${url}${i.src}`)).ok, `icon ${i.src} missing`);
  expect((await fetch(`${url}/sw.js`)).ok, 'sw.js missing');
  const html = await (await fetch(`${url}/`)).text();
  expect(html.includes('rel="manifest"') && html.includes('theme-color'), 'index.html lacks manifest/theme-color');
  expect(!/designarena|rrweb/.test(html), 'third-party telemetry still in index.html');
  const ctl = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; const r = await Promise.race([navigator.serviceWorker.ready.then(() => 'ready'), new Promise(res => setTimeout(() => res('timeout'), 8000))]); return r; });
  expect(ctl === 'ready' || ctl === 'unsupported', `service worker not ready: ${ctl}`);
});

await test('phone: Nebula Strike shows touch controls and they drive the ship', async () => {
  const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p4 = await c4.newPage();
  await p4.goto(url, { waitUntil: 'load' });
  await iconOf(p4, 'Nebula Strike').tap();
  await sleep(600);
  const ctl = p4.locator('[data-touch-controls]');
  expect(await ctl.count() === 1, 'touch controls not rendered on a touch device');
  const fire = ctl.getByRole('button', { name: 'Fire' });
  const fb = await fire.boundingBox();
  expect(fb && fb.x >= 0 && fb.x + fb.width <= 390, 'FIRE button off-screen');
  await fire.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 });
  await sleep(100);
  expect((await ctl.getAttribute('data-pressed')).includes('fire'), 'fire not registered on pointerdown');
  await fire.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });
  await sleep(50);
  expect(!(await ctl.getAttribute('data-pressed')).includes('fire'), 'fire not released on pointerup');
  const left = ctl.getByRole('button', { name: 'Move left' });
  await left.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true, button: 0 });
  await sleep(400);
  await left.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' });
  await p4.screenshot({ path: resolve(SHOTS, 'phone-game.png') });
  await c4.close();
});

await test('opencode window: bridge URL setting (Android / remote PC) is persisted and re-probes', async () => {
  const c5 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p5 = await c5.newPage();
  await p5.goto(url, { waitUntil: 'load' });
  await iconOf(p5, 'opencode').dblclick();
  await p5.waitForSelector('text=/live · v|demo · bridge offline/', { timeout: 15_000 });
  await p5.locator('[aria-label="Bridge settings"]').click();
  const form = p5.locator('[data-bridge-config]');
  await form.locator('input').fill('http://127.0.0.1:1');   // nothing listens here → must fall back to demo
  await form.getByRole('button', { name: 'connect' }).click();
  await p5.waitForSelector('text=demo · bridge offline', { timeout: 15_000 });
  expect(await p5.evaluate(() => localStorage.getItem('nebula.bridgeUrl')) === 'http://127.0.0.1:1', 'bridge url not persisted');
  await p5.locator('[aria-label="Bridge settings"]').click();
  await p5.locator('[data-bridge-config]').getByRole('button', { name: 'reset' }).click();
  expect(await p5.evaluate(() => localStorage.getItem('nebula.bridgeUrl')) === null, 'bridge url not cleared');
  await c5.close();
});

await test('no uncaught page errors during the run', async () => {
  expect(errors.length === 0, errors.slice(0, 5).join(' | '));
});

await browser.close();
if (server) {
  // kill the whole npx → vite process tree on every platform
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); } }
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `, FAILED: ${failed.map(f => f.name).join('; ')}` : ''}\n`);
process.exit(failed.length ? 1 : 0);
