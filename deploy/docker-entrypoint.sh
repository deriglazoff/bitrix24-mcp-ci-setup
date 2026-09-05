#!/bin/sh
# Запуск нативного HTTP/SSE MCP-шлюза (server-http.js): эндпоинты /sse и /mcp.
# Заголовки соединения доходят до сервера → личный вебхук можно задать заголовком
# X-B24-Webhook в конфиге клиента. Аутентификация по X-API-Key — через MCP_API_KEY.
set -eu

export PORT="${PORT:-5015}"
export HOST="${HOST:-0.0.0.0}"

echo "[entrypoint] node server-http.js on ${HOST}:${PORT} (portal: ${B24_DEFAULT_WEBHOOK%%/rest/*})"
exec node /app/server-http.js
