<!-- autopilot:start -->
# Bitrix24 MCP Server

MCP-сервер для Bitrix24: подключает Claude и другие MCP-клиенты к CRM, задачам, диску и календарю через входящий вебхук.

## Команды

| Команда | Что делает |
|---------|------------|
| `npm install` | Установить зависимости |
| `npm start` | Запустить локально (stdio MCP) |
| `npm run start:http` | Запустить HTTP-шлюз |
| `npm test` | Прогнать тесты |
| `Bitrix24-MCP.exe` | Windows: HTTP-шлюз двойным кликом |
| `powershell -File scripts/build-launcher.ps1` | Пересобрать `.exe` |

## Как здесь работает Autopilot

Сборка ведётся навыком `/autopilot`. Требования, спецификация и таски — в `.autopilot/`.
Прогресс — `.autopilot/dashboard.html`. Правило: требование из `manifest.md`
может снять только пользователь.

Если работа продолжается — скажи «продолжи автопилот»: состояние поднимется
из `.autopilot/state.js`, переспрашивать ничего не нужно.
<!-- autopilot:end -->
