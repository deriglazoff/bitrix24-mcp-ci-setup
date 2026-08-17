<!-- autopilot:start -->
# Bitrix24 MCP Server

MCP-сервер для Claude и других MCP-клиентов: CRM, задачи, диск, календарь Bitrix24 через входящий вебхук.

## Команды

| Команда | Что делает |
|---------|------------|
| `npm install` | Установить зависимости (Node ≥ 18, ESM) |
| `npm start` | stdio MCP (`index.js`); без TTY сразу выходит 0 |
| `npm run start:http` | HTTP `/mcp` + SSE `/sse` (`server-http.js`); `PORT` или 5015, `/ping` → `pong` |
| `npm test` | `test/readonly.test.mjs`, без сети |
| `node test/launcher.test.mjs` | шов `.exe`; не-Windows сразу 0 |
| `powershell -ExecutionPolicy Bypass -File scripts/build-launcher.ps1` | `Bitrix24-MCP.exe` в корне через `csc.exe` |
| `.\Bitrix24-MCP.exe` | HTTP-шлюз: читает `.env`, при отсутствии `node_modules` делает `npm install` |

## Структура

```
index.js                 stdio-вход
server-http.js           HTTP-шлюз; `/ping` `/health` без ключа
scripts/                 сборка `.exe` (`build-launcher.ps1`, `launcher/Program.cs`)
src/register-tools.js    общая регистрация `b24_*` для обоих входов
src/bitrix24/            REST-клиент и allowlist read-only
src/tools/               обработчики инструментов
src/utils/               вебхук, ALS-заголовки, пагинация
test/                    гард; шов запускалки; `http-smoke.mjs` не входит в `npm test`
deploy/                  Docker/Swarm; `run-gateway.sh` всё ещё mcp-proxy+`index.js`
.autopilot/              прогон Autopilot
```

## Подводные камни

- `.env` читает только `Bitrix24-MCP.exe` (dotenv нет); уже заданные переменные не перезаписывает. `.exe` обязан лежать рядом с `server-http.js`.
- `B24_READONLY` fail-safe: не задан/пусто/`true` → только чтение. Запись: `false`/`0`/`no`/`off`, либо `personal_webhook`, либо `X-B24-Webhook` (https, тот же hostname, что у `B24_DEFAULT_WEBHOOK`, путь `/rest/<id>/<token>/`).
- `X-B24-Webhook` работает только на HTTP-шлюзе; stdio — параметр `personal_webhook`. В read-only `webhook_url` игнорируется.
- `B24_PERSONAL_WEBHOOK` в compose/CI Node не читает. `B24_REQUIRED_SCOPES` из `.env.example` в коде нет.
- Write-тулы всегда зарегистрированы; гард на вызове. Сборка `.exe` — `csc.exe` из .NET Framework 4, не `dotnet`.
- `MCP_API_KEY` → заголовок `X-API-Key`; `/ping` и `/health` до этой проверки.

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Правило: требование из `manifest.md`
может снять только пользователь.

Если работа продолжается — скажи «продолжи автопилот»: состояние поднимется
из `.autopilot/state.js`, переспрашивать ничего не нужно.
<!-- autopilot:end -->
