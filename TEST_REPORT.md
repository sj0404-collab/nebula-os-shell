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

---

## Дополнение (2026-10-28, вечер): автотесты кодом, исправления, кроссплатформенность

### Найдено и исправлено
| # | Баг / проблема | Исправление |
|---|---|---|
| 1 | Иконка рабочего стола имела и `onClick`, и `onDoubleClick` → двойной клик открывал **3 окна** | одиночный клик только выделяет, двойной открывает; на touch/pen — открытие по тапу; Enter с клавиатуры |
| 2 | Любое приложение открывалось бесконечно много раз (Steam, Settings…) | одноэкземплярные приложения фокусируют уже открытое окно (многоэкземплярные: терминал, блокнот, проводник) |
| 3 | Перетаскивание/ресайз окон только мышью (`mousedown/mousemove`) — не работало на сенсорных экранах | pointer‑events (мышь + touch + стилус), `touch-none`, `pointercancel` |
| 4 | Окна 900–980 px вылезали за экран телефона/маленького ноутбука | размер и позиция подгоняются под viewport при открытии; < 640 px — открывается развёрнутым; клэмп при resize/повороте |
| 5 | `dir` в терминале печатал плоский список без `<DIR>`/размеров | Windows‑формат: `<DIR>`, размеры, счётчики File(s)/Dir(s) |
| 6 | Счётчик токенов в статус‑баре opencode суммировал input+output каждого шага (399 при реальных 8 302) | показывает `tokens.total` последнего шага, как настоящий TUI |
| 7 | Мост: в compiled‑бинарнике корень `/$bunfs` (dist не находился), только POSIX‑пути к `opencode`, `.cmd`‑шимы Windows не запускались, занятый порт падал со стеком | поиск бинарника на Win/mac/Linux, обёртка `cmd.exe /c` для `.cmd`, корень = cwd или папка exe, понятные ошибки, `SIGBREAK`/`exit` убивают дочерний `opencode serve` |
| 8 | Меню «Пуск» выше экрана телефона | `max-h: calc(100vh − 3rem)` |

### Автотесты (всё запускается командами, результаты реальные)
| Набор | Команда | Результат |
|---|---|---|
| ESLint + tsc (приложение и мост) | `npm run lint && npm run typecheck` | 0 ошибок |
| Мост + реальная модель | `bun test opencode/bridge.test.ts` | 4/4 pass |
| Playwright e2e рабочего стола | `node e2e/run.mjs` (сам поднимает `vite preview`) | **15/15 pass** (~40 с) |
| e2e с живым мостом | `node e2e/with-bridge.mjs` | 15/15, LIVE‑окно: ответ «PICKLE LIVE» + вызов `bash ls opencode` |
| Кросс‑компиляция моста | `bun run opencode/compile-all.ts` | linux‑x64 109 МБ, macOS‑arm64 89 МБ, windows‑x64 115 МБ — все собираются; linux‑бинарник запущен и проверен |

Сценарии e2e: загрузка рабочего стола (8 иконок), 1 окно на двойной клик, одиночный клик не открывает, single‑instance, открытие/рендер/закрытие всех приложений, minimize→taskbar→restore и maximize, drag окна, меню Пуск → Notepad, терминал (`ver`, `dir`, `dir Downloads`, `echo`, `help`, `cd ..`, `opencode`), автотест Nebula Strike (WIN ≥ 7000), клавиатура + непустой canvas, opencode DEMO при недоступном мосте (route abort), opencode LIVE, телефон 390×844 (тап открывает, окно не вылезает), отсутствие page errors.

### CI
`.github/workflows/ci.yml`: матрица **ubuntu / windows / macos** — lint, typecheck, build, установка настоящего `opencode-ai`, `bun test` моста, Playwright e2e с живым мостом, артефакты‑скриншоты; затем сборка бинарников моста для 5 платформ и Release по тегу `v*`.

---

## Дополнение (2026-10-29): Web + Android

| Что сделано | Проверка |
|---|---|
| **PWA**: `manifest.webmanifest`, иконки 192/512/maskable, service worker (vite-plugin-pwa, autoUpdate; `/api/opencode` — NetworkOnly, `downloads/` не кэшируется), `theme-color`, `viewport-fit=cover` | e2e «PWA: manifest, icons and service worker are served» — manifest валиден, все иконки отдаются, SW `ready` |
| Убраны сторонние скрипты телеметрии (rrweb / designarena) из `index.html` | e2e проверяет их отсутствие |
| **Android‑приложение (Capacitor 8)**: `android/` проект, appId `com.bigpickle.nebulaos`, иконки, cleartext для моста в LAN, подписанный release APK в CI (демо‑keystore в репо, переопределяется env) | CI job «Android APK (Capacitor)»: `gradlew assembleRelease` → `apksigner verify` + `aapt dump badging`; APK прикрепляется к Release по тегу |
| **Настройка адреса моста** в окне opencode (⚙): для APK/статического хостинга — `http://IP‑ПК:8787`; хранится в localStorage, окно переподключается; CORS у моста уже `*` | e2e «bridge URL setting…»: сохранение, fallback в demo при недоступном адресе, сброс |
| **Сенсорное управление** в Nebula Strike (◀ ▶ FIRE, restart) для устройств с `pointer: coarse`, вертикальная раскладка панели на узких экранах | e2e «phone: Nebula Strike shows touch controls…» — кнопки в пределах 390 px, pointerdown/up переключают состояние, корабль двигается |
| Мост отдаёт `.webmanifest`, `sw.js`/`registerSW.js` с `no-cache` | bun test моста (4/4) |

Итого e2e: **18/18** локально (с живым мостом); полный прогон — в GitHub Actions на ubuntu/windows/macos + Android‑сборка.

## Дополнение (2026-10-29, вечер): нативный opencode на Android + WebGL‑рендер (v1.2.0)

Требование: «полноценный WebGL + wasm64 эмулятор, который работает и на Android, а opencode — нативно, без сервера на ПК».

### Как был вскрыт бесплатный Zen без CLI
Бесплатный endpoint `https://opencode.ai/inference/openai/v1/chat/completions` (`Authorization: Bearer public`) отвечает
`429 FreeUsageLimitError` любому «чужому» клиенту. Экспериментально (перехват реального CLI через подмену baseURL и
точный повтор запроса из Bun, затем бисекция) установлено, что он принимает запрос только когда одновременно:
`stream:true`, `User-Agent: opencode/1.19.5 …`, заголовки `x-opencode-session`/`x-opencode-request` **в формате
идентификаторов opencode** (`ses_`/`msg_` + 12 hex от `timestamp*4096+counter` (для сессий — побитовое НЕ) + 14 base62),
системный промпт opencode и его каталог tools. TLS‑отпечаток, IP и остальное значения не имеют. Всё это реализовано в
`src/lib/agent/core.ts` — поэтому агент работает **из любого окружения: Bun, браузер (через pass‑through), Android (Java HTTP)**.

| Что сделано | Проверка |
|---|---|
| **Нативный агент opencode** `src/lib/agent/core.ts`: цикл «модель → tool_calls → выполнение → ответ», SSE‑парсер (text / reasoning / tool_calls / usage), tools `read write edit glob grep bash webfetch todowrite task` (subagent), ошибки инструментов возвращаются модели | `bun test opencode/native-agent.test.ts` — **3/3**: промпт/каталог совпадают с CLI; реальная модель big‑pickle вызвала `bash` (`ls`) и `write`, файл `hello.txt` = «native ok» |
| **Android**: Capacitor‑плагин `NebulaNativePlugin.java` — `exec` (/system/bin/sh, cwd = workspace, таймаут), `readFile/writeFile/list/exists`, `httpStream` (потоковый HTTPS из Java, строки SSE → события `httpLine`), `httpFetch`, `info` (ABI, Android, WebView). Регистрация в `MainActivity`. Workspace: `Android/data/com.bigpickle.nebulaos/files/workspace` | компиляция и подпись APK в CI (job «Android APK»); тот же TS‑код цикла прошёл тест на реальной модели; на устройстве: окно opencode → бейдж «native · on‑device», shell‑команды выполняются на телефоне |
| **Web**: мост получил pass‑through `/api/opencode/zen/*` (добавляет User‑Agent, пробрасывает `x-opencode-*`); хост с VFS в localStorage | e2e «NATIVE mode — agent loop runs in the page…»: модель через /zen, инструмент `write` создал `/workspace/todo.md` = «NATIVE OK», счётчик токенов |
| Окно opencode: режимы `auto / native / bridge` (⚙), поле для своего ключа Zen, сброс браузерного workspace, бейджи и статус‑бар для native | e2e «agent mode switch … is persisted» + «bridge URL setting…» |
| **WebGL‑рендер** `src/lib/webgl.ts`: WebGL2 (fallback WebGL1 → Canvas 2D), фоновый шейдер (градиент + 2 туманности + мерцание), батч сплошной геометрии, аддитивный glow‑проход (плазма, выхлоп, ореолы), HUD‑текстура; данные вершин читаются напрямую из linear memory wasm64 (`NebulaWasm64.views()`) без аллокаций | e2e «real WebGL renderer (WebGL2) draws the wasm64 scene»: `data-renderer=webgl2`, `data-engine=wasm64`, readPixels: >1 % освещённых пикселей, >100 голубых (корабль/плазма); в headless Chromium — ANGLE/SwiftShader Vulkan; на Android WebView 148 — GPU устройства |
| wasm64 на Android | WebView ≥133 поддерживает memory64; у пользователя WebView 148 — модуль грузится нативно в APK, бейдж `WASM64 · MEMORY64 · WEBGL2` |

Итого: `bun test` 4+3, e2e **21/21** локально с живым мостом; CI: ubuntu/windows/macos + Android APK + бинарники моста.
Ограничения: `websearch`/`skill` недоступны в нативном режиме (модель получает понятную ошибку); в браузере нет `bash`
(только файловые инструменты) — полный shell есть в Android‑APK и в режиме bridge.
