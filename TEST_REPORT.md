# Отчёт о тестировании — «Windows 10 — WASM64 + WebGL Edition · Nebula Strike» (agon-agent_2-9b43077b)

Дата: 2026-10-28. Среда: Node 20.20 / Node 24.22, Chromium 156 (Playwright, headless), zig 0.17 (ziglang pip).

## Что проверено

| Проверка | Результат |
|---|---|
| `npm ci` / `tsc -b` / `vite build` | ✅ собирается (бандл 524 КБ, предупреждение о размере чанка) |
| `eslint .` | ❌ было 21+ ошибок → ✅ 0 после правок |
| `nebula_strike_wasm32.wasm` под WASI (Node 20 и 24) | ✅ автотест WIN · 7500 · волна 5/5 · 2563 кадра · 3 жизни, checksum 11544 — совпадает с test_results.json |
| `nebula_strike_wasm64.wasm` (настоящий memory64: флаг памяти 0x04, table64) | ✅ в Node 24 / Chromium 156: ptr_bits=64, size_bits=64, автотест WIN 7500 (паритет с wasm32). ⚠ В Node 20 (V8 11.x) не загружается — `invalid table elements limits flags` (нужен движок с table64: Chrome 133+, Firefox 134+, Node ≥ 22) |
| `NebulaStrike.exe` (PE32+, x86-64, импорт gdi32/user32/kernel32) | ⚠ собран с подсистемой **console (3)** при WinMain+GDI → при запуске рядом с игрой открывалось чёрное окно консоли. Пересобран с `-Wl,--subsystem,windows` → GUI (2). Сборка воспроизводима (размер байт в байт 234 496) |
| Скрипты `game/build.sh`, `build.bat`, README | ✅ все три цели собираются zig 0.17; добавлен флаг подсистемы |
| E2E в Chromium 156: загрузка, рабочий стол, игра | ✅ игра запускается на движке WASM64 (HUD «60 FPS · WASM64 · MEMORY64»), управление клавиатурой работает (счёт растёт), «Run AI autotest» → WIN 7500, «Benchmark» → ~2,25 млн logic fps |
| Окна: Command Prompt, Steam, Epic, Edge, opencode, File Explorer | ✅ открываются и закрываются |
| Терминал: `dir`, `cd`, `node -v`, `node -e`, `wasm64`, `python -V`, `tasklist`, `start nebula`, `ver` | ✅ после исправлений |
| Загрузки `/downloads/*` | ✅ все 5 файлов отдаются (200, размеры верные) |

## Найденные и исправленные ошибки

1. **Рабочий стол не кликался.** Слой окон `WindowsLayer` (`absolute inset-0 z-[100]`) без `pointer-events-none` перекрывал все иконки рабочего стола — открыть программу можно было только через панель задач/Пуск. Исправлено: `pointer-events-none` на слое, `pointer-events-auto` на окне (`src/App.tsx`, `WindowFrame.tsx`).
2. **Терминал: `dir` всегда отвечал «File Not Found».** `fsList` искал первый сегмент пути (`C:`) среди детей корня. Исправлено: обход с `path.slice(1)` (`TerminalApp.tsx`).
3. **Игра перехватывала клавиши у других приложений.** Глобальный обработчик делал `preventDefault` для A/D/W/R/Space/стрелок при любом открытом окне игры — в терминале/Блокноте пропадали буквы (в тесте `ver` превращался в `ve`). Теперь игра реагирует только когда её окно верхнее и фокус не в поле ввода (`NebulaApp.tsx`).
4. **HUD всегда писал «game engine: WASM64 (memory64)»**, даже при JS‑fallback без memory64. Теперь подпись отражает реальный движок.
5. **`help` в терминале советовал `cd C:\dev\game`** — такого каталога в виртуальной ФС нет. Заменено на существующий `C:\Program Files\Big Pickle Studios\NebulaStrike`.
6. **NebulaStrike.exe — подсистема console вместо GUI** (см. таблицу). Пересобран, `.pdb` обновлён, скрипты сборки поправлены.
7. **ESLint (21 ошибка):** неиспользуемые импорты/переменные, `any` в `memory64.ts`, `@ts-ignore`, пустой `catch`, `setState` внутри `useEffect` (EdgeApp/ExplorerApp — переписано без эффекта), `doReset` до объявления, мёртвый `useReducer` в EdgeApp.
8. `vite.config.ts`: добавлены `server/preview.allowedHosts` — иначе preview отвечал 403 на внешний хост.

## Замечания без правок

- `index.html` содержит внешнюю телеметрию (rrweb с jsdelivr + `designarena.ai/api/agon/page-views`). Без интернета это даёт `Failed to fetch` в консоли и мешает `networkidle`; на работу приложения не влияет. Если это не нужно в проде — удалить из `index.html`.
- `python -c` требует загрузки Pyodide (~10 МБ) с CDN — офлайн не работает, `python -V` отвечает статической строкой без загрузки.
- Memory64 в браузере: Chrome ≥ 133 / Firefox ≥ 134 / Safari — пока нет; в остальных движках приложение корректно уходит на JS‑порт игры (проверено логикой `NebulaWasm64.init`).
- Иконки рабочего стола открывают окно по одиночному клику (в Windows — двойной); двойной клик открывает два окна. Оставил как есть — вопрос дизайна.
- `nebula_bench` в wasm64 возвращает число кадров (3600), а в `test_results.json` поле `checksum: 11544` относится к wasm32 — показатели не сравнимы между собой, это не ошибка, но подпись в JSON сбивает с толку.

## Артефакты

- `test-desktop.png`, `test-game.png`, `test-game2.png`, `test-terminal.png`, `test-*.png` — скриншоты e2e.
- Исправленный проект: `/home/user/agon-agent/` и архив `/home/user/agon-agent-fixed.zip` (без node_modules/dist).

---

## Дополнение (2026-10-28): реальный opencode TUI на Bun

| Проверка | Результат |
|---|---|
| `bun run opencode/bridge.ts` (Bun 1.4.4) | поднимает `opencode serve` v1.19.5 на :4096, сам слушает :8787 |
| `bun test opencode/bridge.test.ts` | **4 pass / 0 fail** (bridge info, health+providers, реальный промпт по SSE → «BRIDGE OK», статика) |
| `bun build --compile` → `./opencode-bridge` | 109 МБ бинарник, запускается, `/global/health` = healthy |
| UI (Playwright, `vite preview` + мост) | бейдж **live · v1.19.5**, промпт → ответ «PICKLE LIVE», агент сам вызвал `bash ls -la opencode/`, вывод отрисован, tokens 8 288, 0 ошибок консоли |
| Без моста | окно автоматически переходит в режим **demo · bridge offline** (старый сценарий) |
| `eslint` / `npm run build` | 0 ошибок / ✓ built |

Модель: `opencode/big-pickle` (OpenCode Zen, бесплатно, без ключа). Скриншот: `docs/opencode-live.png`.
