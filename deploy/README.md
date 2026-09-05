# Деплой Bitrix24 MCP в сеть (test + prod)

Шлюз: нативный HTTP/SSE-сервер на MCP SDK (`server-http.js`), поднимает **SSE** (`/sse`) и **streamable HTTP** (`/mcp`), отдельный MCP-сервер на сессию. Заголовки соединения доходят до обработчиков — поэтому личный вебхук можно задать заголовком `X-B24-Webhook` (раньше шлюзом был `mcp-proxy`, который терминировал HTTP в stdio и заголовки терял).

| Инстанс | Порт | env | URL (LAN, после проброса) |
|---|---|---|---|
| TEST | 5013 | `.env.test` | `http://192.168.103.95:5013/sse` · `/mcp` |
| PROD | 5014 | `.env.prod` | `http://192.168.103.95:5014/sse` · `/mcp` |

## 1. Запуск (сейчас работает так, detached)
```bash
cd /mnt/c/projects/bitrix24-mcp-bit2beat
setsid nohup bash deploy/run-gateway.sh 5013 mcp-test deploy/.env.test >logs/test.log 2>&1 &
setsid nohup bash deploy/run-gateway.sh 5014 mcp-prod deploy/.env.prod >logs/prod.log 2>&1 &
```
Переживает закрытие сессии/шелла, **но не перезагрузку**. Для автозапуска — см. §3.

## 2. Выход в LAN (Windows, админ)
Сеть WSL = NAT, поэтому с других машин нужен проброс на Windows-хосте:
```powershell
# PowerShell ОТ АДМИНИСТРАТОРА:
powershell -ExecutionPolicy Bypass -File C:\projects\bitrix24-mcp-bit2beat\deploy\expose-lan.ps1
```
Скрипт берёт текущий WSL-IP, ставит `netsh portproxy` 0.0.0.0:{5013,5014} → WSL-IP и открывает firewall.
⚠️ WSL-IP меняется при перезагрузке → после ребута прогнать скрипт заново.

**Альтернатива (чище, без portproxy):** mirrored-networking. Создать `C:\Users\mokhov.s\.wslconfig`:
```ini
[wsl2]
networkingMode=mirrored
```
затем `wsl --shutdown` и перезапуск. Тогда WSL делит IP с Windows, `0.0.0.0`-сервисы видны в LAN напрямую (firewall-правило всё равно нужно). Требует Win11 22H2+.

## 3. Автозапуск после перезагрузки (systemd, нужен sudo)
```bash
sudo cp deploy/bitrix-mcp-test.service deploy/bitrix-mcp-prod.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bitrix-mcp-test bitrix-mcp-prod
# статус: systemctl status bitrix-mcp-prod
```
Чтобы WSL сам стартовал при входе в Windows (иначе systemd ждёт первого запуска wsl) — добавить в Планировщик задач Windows триггер «При входе» с действием `wsl.exe -d Ubuntu -e true`.

## 4. Подключение агента (пример MCP-клиента)
```json
{
  "mcpServers": {
    "bitrix24-prod": { "type": "sse", "url": "http://192.168.103.95:5014/sse" }
  }
}
```
Streamable HTTP: `{ "type": "http", "url": "http://192.168.103.95:5014/mcp" }`.
Если включишь `MCP_API_KEY` в `.env.*` — добавь заголовок `X-API-Key`.

## 5. Безопасность

### Режим только чтение (read-only) — для публичного/корпоративного стенда
Общий вебхук (`B24_DEFAULT_WEBHOOK`) по умолчанию работает в режиме **только чтение**
(fail-safe): запись блокируется, пока явно не задан `B24_READONLY=false`.

- **Гард** (`src/bitrix24/readonly.js`) — allowlist (deny-by-default): пропускаются
  только методы чтения (`*.get`, `*.list`, `*.fields`, `get*` и явный список).
  Любой мутирующий REST-метод (в т.ч. `tasks.task.delegate`, `disk.folder.deletetree`,
  спрятанный внутри `batch` или вложенного `batch`) — блокируется на уровне клиента.
- **read-only — свойство ВЫЗОВА**, а не только глобальный env: клиент на общем
  вебхуке наследует `B24_READONLY`; клиент на личном вебхуке — нет (см. ниже).
- **webhook_url** (per-call override) на общем вебхуке в read-only игнорируется —
  всегда серверный `B24_DEFAULT_WEBHOOK` (защита от SSRF и подмены портала).
- Конфиг: `deploy/.env.test` и `deploy/.env.prod` → `B24_READONLY=true` (общий вебхук
  на обоих стендах только читает); CI задаёт значения явно; дефолт в
  `docker-compose.yml` — `:-true`. Запись на любом стенде — только через личный вебхук.

Проверка гарда без сети: `node test/readonly.test.mjs`.

### Запись под личной учёткой — параметр `personal_webhook`
Личный вебхук передаётся одним из двух способов (приоритет — у параметра):
1. **Заголовок соединения `X-B24-Webhook`** — задаётся один раз в конфиге MCP-клиента
   (`headers`), агент токена не видит. Рекомендуется для постоянной работы.
2. **Параметр `personal_webhook`** в конкретном вызове любого write-инструмента
   (или `b24_call`/`b24_batch`) — разово.

Операция идёт через личный вебхук: под учётной записью и правами его владельца,
а общий вебхук прав на запись не получает.

- Без `personal_webhook` write-вызов на общем вебхуке блокируется гардом.
- Write-инструменты **видны всегда** (и на read-only стенде) — они срабатывают,
  как только передан валидный `personal_webhook`.
- Валидация (`src/utils/resolve-webhook.js`): только `https`, **только тот же портал**,
  что в `B24_DEFAULT_WEBHOOK` (защита от SSRF), формат `/rest/<id>/<token>/`.
- Пример: `b24_tasks_create({ fields: {…}, personal_webhook: "https://resultforyou.ru/rest/<myId>/<myToken>/" })`.

### Аутентификация эндпоинта
- LAN-доступ открыт всем в сети. Задай `MCP_API_KEY` в `.env.*` (CI-переменные
  `MCP_API_KEY_TEST` / `MCP_API_KEY_PROD`) — `docker-entrypoint.sh` подключит
  `--apiKey`, и агенты обязаны слать заголовок `X-API-Key`.

### Least-privilege сервис-юзер для публичного стенда (defense-in-depth)
Read-only гард — основной контроль, но его стоит подстраховать на уровне портала,
чтобы даже при обходе кода у вебхука физически не было прав на запись:

1. В Битрикс24 создать **отдельного непривилегированного пользователя** (НЕ админ),
   предназначенного только для публичного MCP.
2. Сгенерировать для него входящий вебхук с **минимальными скоупами**, нужными для
   чтения: `crm, task/tasks, user, department, disk, calendar, im, catalog`.
3. Прописать этот вебхук в `B24_DEFAULT_WEBHOOK` тест-стенда (CI-переменная
   `B24_DEFAULT_WEBHOOK`); `B24_PERSONAL_WEBHOOK` на публичном стенде **не задавать**.
4. ⚠️ Скоупы вебхука Битрикса НЕ разделяют чтение/запись внутри одного скоупа —
   поэтому app-level гард (п. «Режим только чтение») остаётся главной защитой;
   сервис-юзер лишь сужает радиус поражения.

### Прочее
- Вебхуки Bitrix лежат в `.env.{prod,test}` — не коммитить (уже в `.gitignore`).
