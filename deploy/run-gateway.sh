#!/usr/bin/env bash
# stdio→HTTP gateway для Bitrix24 MCP (bit2beat) через mcp-proxy.
# Поднимает SSE (/sse) и streamable HTTP (/stream), отдельный процесс сервера на сессию.
# Использование: run-gateway.sh <PORT> <NAME> <ENVFILE>
set -euo pipefail

PORT="${1:?usage: run-gateway.sh <PORT> <NAME> <ENVFILE>}"
NAME="${2:-mcp}"
ENVFILE="${3:-/mnt/c/projects/bitrix24-mcp-bit2beat/deploy/.env.prod}"

ROOT="/mnt/c/projects/bitrix24-mcp-bit2beat"
SERVER="$ROOT/index.js"
LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

# webhooks/секреты из env-файла инстанса (B24_DEFAULT_WEBHOOK, B24_PERSONAL_WEBHOOK, опц. MCP_API_KEY)
set -a; # shellcheck disable=SC1090
source "$ENVFILE"; set +a

APIKEY_ARG=()
[ -n "${MCP_API_KEY:-}" ] && APIKEY_ARG=(--apiKey "$MCP_API_KEY")

echo "[$(date '+%F %T')] starting $NAME on 0.0.0.0:$PORT (portal: ${B24_DEFAULT_WEBHOOK%%/rest/*})"
exec npx -y mcp-proxy@latest --host 0.0.0.0 --port "$PORT" "${APIKEY_ARG[@]}" -- node "$SERVER"
