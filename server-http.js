// HTTP/SSE-шлюз Bitrix24 MCP на нативном SDK (без mcp-proxy).
// Поднимает Streamable HTTP (/mcp) и legacy SSE (/sse + /messages).
// Главное отличие от mcp-proxy: заголовки соединения доходят до обработчиков
// (extra.requestInfo.headers), поэтому личный вебхук можно задать ОДИН раз в
// конфиге клиента — заголовком X-B24-Webhook — а не в каждом запросе.

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registerAllTools, SERVER_INSTRUCTIONS } from './src/register-tools.js';

const PORT = Number(process.env.PORT || 5015);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = (process.env.MCP_API_KEY || '').trim();

function buildServer() {
  const server = new McpServer({ name: 'bitrix24-config', version: '2.0.0' }, { instructions: SERVER_INSTRUCTIONS });
  registerAllTools(server);
  return server;
}

const app = express();
app.use(express.json({ limit: '32mb' }));

// Health-check (без аутентификации) — для healthcheck и проверки из браузера.
app.get('/ping', (req, res) => res.type('text/plain').send('pong'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Опциональная аутентификация эндпоинта (замена --apiKey из mcp-proxy).
app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.headers['x-api-key'] === API_KEY) return next();
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized: bad or missing X-API-Key' }, id: null });
});

// ── Streamable HTTP (/mcp) ──────────────────────────────────────────────────
const httpTransports = {}; // sessionId -> transport

app.post('/mcp', async (req, res) => {
  const sid = req.headers['mcp-session-id'];
  let transport = sid ? httpTransports[sid] : undefined;

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session: send an initialize request first' }, id: null });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { httpTransports[id] = transport; },
    });
    transport.onclose = () => { if (transport.sessionId) delete httpTransports[transport.sessionId]; };
    await buildServer().connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// GET (server-stream) и DELETE (close) для уже открытой сессии.
async function streamableSession(req, res) {
  const sid = req.headers['mcp-session-id'];
  const transport = sid ? httpTransports[sid] : undefined;
  if (!transport) { res.status(400).send('Invalid or missing session ID'); return; }
  await transport.handleRequest(req, res);
}
app.get('/mcp', streamableSession);
app.delete('/mcp', streamableSession);

// ── Legacy SSE (/sse + /messages) ───────────────────────────────────────────
const sseTransports = {}; // sessionId -> transport

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  sseTransports[transport.sessionId] = transport;
  res.on('close', () => { delete sseTransports[transport.sessionId]; });
  await buildServer().connect(transport);
});

app.post('/messages', async (req, res) => {
  const sid = req.query.sessionId;
  const transport = sid ? sseTransports[sid] : undefined;
  if (!transport) { res.status(400).send('No transport found for sessionId'); return; }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  const portal = (process.env.B24_DEFAULT_WEBHOOK || '').split('/rest/')[0] || '(no default webhook)';
  process.stderr.write(`[bitrix24] HTTP MCP on ${HOST}:${PORT} (/sse, /mcp) | portal ${portal} | apiKey ${API_KEY ? 'on' : 'off'}\n`);
});
