# Подключение к Bitrix24 MCP — инструкция для коллег

MCP-сервер Bitrix24 (CRM, задачи, диск, календарь, IM — 40 инструментов в профиле `daily`, 44 при `B24_MCP_PROFILE=full`) доступен по сети как HTTP-эндпоинт. Подключается любой MCP-клиент (Claude Code, Claude Desktop, Cursor, Windsurf, Cline, агенты на Python/Node).

## Адреса

| Среда | Базовый URL | Транспорты | Режим |
|---|---|---|---|
| **TEST** | `http://ai.dobrozaim.test:5015` | SSE: `/sse` · HTTP: `/mcp` | **только чтение** на общем вебхуке; запись — со своим вебхуком (см. ниже) |
| **PROD** | `http://ai.dobrozaim.ru:5015` | SSE: `/sse` · HTTP: `/mcp` | **только чтение** на общем вебхуке; запись — со своим вебхуком (см. ниже) |

### Запись под своей учётной записью
Общий вебхук — **только чтение** для всех. Чтобы писать (создавать сделки/задачи и т.д.) под собой,
задай свой **личный входящий вебхук** один раз в конфиге подключения — заголовком `X-B24-Webhook`:

```json
"bitrix24-test": {
  "type": "sse",
  "url": "http://ai.dobrozaim.test:5015/sse",
  "headers": { "X-B24-Webhook": "https://resultforyou.ru/rest/<твойID>/<твойТокен>/" }
}
```
Личный вебхук берётся в Битриксе: *профиль → Вебхуки → входящий вебхук*. Требования: `https`,
**тот же портал** `resultforyou.ru`, формат `/rest/<id>/<token>/`. Без заголовка запись блокируется.
(Альтернатива без настройки конфига — передать `personal_webhook` параметром в конкретном вызове.)
Токен — это доступ к Битриксу под тобой: не публикуй его.

- **Health-check:** открой в браузере `http://ai.dobrozaim.test:5015/ping` → должно вернуть `pong`.
- **Требование сети:** нужно быть в корпоративной сети/VPN (имя `ai.dobrozaim.test` резолвится только внутри). Если имя не открывается — проверь VPN или спроси у инфраструктуры IP воркера.
- **Транспорт:** бери **SSE** (`/sse`) — он поддерживается шире всего. **Streamable HTTP** (`/mcp`) — современная альтернатива, если клиент его умеет.
- **Аутентификация:** сейчас нет. Если включат ключ (`MCP_API_KEY`) — нужно слать заголовок `X-API-Key: <ключ>` (как — см. примечания у каждого клиента).

---

## 1. Claude Code (CLI)

```bash
# глобально для всех проектов (рекомендуется):
claude mcp add -s user --transport sse bitrix24 http://ai.dobrozaim.test:5015/sse

# проверить:
claude mcp list           # ждём: bitrix24 ... ✓ connected
claude mcp get bitrix24
```
- Streamable HTTP вместо SSE: `--transport http http://ai.dobrozaim.test:5015/mcp`.
- С ключом: добавь `--header "X-API-Key: <ключ>"`.
- После добавления **перезапусти сессию** — появятся тулзы `mcp__bitrix24__b24_*`.
- Области (`-s`): `local` (только текущая папка, по умолчанию), `project` (общий `.mcp.json` в репо), `user` (везде).

## 2. Claude Code — общий конфиг в репозитории (`.mcp.json`)

Положи в корень проекта файл `.mcp.json` и закоммить — подхватят все в команде:
```json
{
  "mcpServers": {
    "bitrix24": { "type": "sse", "url": "http://ai.dobrozaim.test:5015/sse" }
  }
}
```

## 3. Claude Desktop

Desktop напрямую SSE/HTTP не умеет — мост через `mcp-remote`. Файл конфига:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "bitrix24": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://ai.dobrozaim.test:5015/sse"]
    }
  }
}
```
С ключом: добавь в `args` → `"--header", "X-API-Key:<ключ>"`. Нужен установленный Node.js. Перезапусти Claude Desktop.

## 4. Cursor

Файл `~/.cursor/mcp.json` (глобально) или `.cursor/mcp.json` в проекте:
```json
{
  "mcpServers": {
    "bitrix24": { "url": "http://ai.dobrozaim.test:5015/sse" }
  }
}
```
Settings → MCP → должен загореться зелёным.

## 5. Windsurf

Файл `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "bitrix24": { "serverUrl": "http://ai.dobrozaim.test:5015/sse" }
  }
}
```

## 6. Cline / Roo Code (VS Code)

В настройках MCP добавь сервер:
```json
{
  "mcpServers": {
    "bitrix24": { "url": "http://ai.dobrozaim.test:5015/sse", "transportType": "sse" }
  }
}
```

## 7. Python (официальный MCP SDK)

```bash
pip install mcp
```
```python
import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

async def main():
    async with sse_client("http://ai.dobrozaim.test:5015/sse") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print([t.name for t in tools.tools])
            res = await session.call_tool("b24_call", {"method": "user.current"})
            print(res.content[0].text)

asyncio.run(main())
```
Streamable HTTP — то же, но `from mcp.client.streamable_http import streamablehttp_client` и `streamablehttp_client("http://ai.dobrozaim.test:5015/mcp")` (возвращает 3 значения: read, write, _).

## 8. LangChain / LangGraph (для RAG-агента)

```bash
pip install langchain-mcp-adapters
```
```python
from langchain_mcp_adapters.client import MultiServerMCPClient

client = MultiServerMCPClient({
    "bitrix24": {"url": "http://ai.dobrozaim.test:5015/sse", "transport": "sse"}
})
tools = await client.get_tools()   # готовые LangChain-инструменты для агента
```

## 9. OpenAI Agents SDK

```python
from agents.mcp import MCPServerSse
server = MCPServerSse(params={"url": "http://ai.dobrozaim.test:5015/sse"})
# передать server в Agent(mcp_servers=[server])
```

## 10. Node / TypeScript (MCP SDK)

```bash
npm i @modelcontextprotocol/sdk
```
```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(new SSEClientTransport(new URL("http://ai.dobrozaim.test:5015/sse")));
console.log((await client.listTools()).tools.map(t => t.name));
await client.callTool({ name: "b24_call", arguments: { method: "user.current" } });
```

## 11. curl (проверка/отладка)

```bash
# health:
curl http://ai.dobrozaim.test:5015/ping              # -> pong

# полный MCP-handshake (streamable HTTP):
curl -s -D- -X POST http://ai.dobrozaim.test:5015/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
# из ответа возьми заголовок mcp-session-id и шли его в следующих запросах (tools/list, tools/call)
```

---

## Ключевые инструменты (40 шт. в `daily`, префикс `b24_`)

- **Универсальные:** `b24_call` (любой REST-метод), `b24_batch` (пачкой), `b24_test_connection`.
- **CRM (чтение):** `b24_crm_list`, `b24_crm_get`, `b24_crm_fields`.
- **Задачи:** `b24_tasks_list`, `b24_tasks_get`.
- **Конфиг портала (чтение):** `b24_read_pipelines`, `b24_read_custom_fields`, `b24_read_automations`.
- **Admin (только `B24_MCP_PROFILE=full`):** `b24_read_full_config`, `b24_apply_config`, `b24_compare_configs`, `b24_save_user_mapping`.
- **Прочее (чтение):** `b24_users_list`, `b24_departments_list`, `b24_disk_*`, `b24_calendar_list`, `b24_groups_list`, `b24_products_*`.

> На **TEST** все методы записи (`*_create/update/delete`, `b24_call` с `crm.deal.add` и т.п.) вернут ошибку `B24_READONLY … заблокирован` — это норма, среда только для чтения. Запись будет на PROD.

## Если не подключается
1. `http://ai.dobrozaim.test:5015/ping` не открывается → ты вне корпоративной сети/VPN, либо имя не резолвится (спроси IP воркера).
2. Клиент пишет «connection refused/timeout» → проверь, что используешь `/sse` (а не `/mcp`) для SSE-клиентов и наоборот.
3. Тулзы не появились → перезапусти клиента (MCP-серверы подхватываются при старте сессии).
