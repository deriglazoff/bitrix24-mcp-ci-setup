// E2E smoke-тест HTTP-шлюза: проверяет, что заголовок X-B24-Webhook долетает до
// обработчика. Запуск: PORT=5099 node test/http-smoke.mjs  (сервер должен быть поднят)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PORT = process.env.PORT || 5099;
const url = new URL(`http://127.0.0.1:${PORT}/mcp`);

async function connect(headers) {
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

let fail = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };

// 1) без заголовка: список инструментов + чтение
{
  const { client, transport } = await connect({});
  const tools = await client.listTools();
  console.log(`tools: ${tools.tools.length}`);
  const expected = (process.env.B24_MCP_PROFILE || 'daily').trim().toLowerCase() === 'full' ? 44 : 40;
  tools.tools.length === expected
    ? ok(`${expected} инструмента опубликованы`)
    : bad(`ожидалось ${expected}, получено ${tools.tools.length}`);

  const prof = await client.callTool({ name: 'b24_call', arguments: { method: 'profile' } });
  const ptxt = prof.content?.[0]?.text || '';
  /resultforyou\.ru|"ID"/.test(ptxt) && !prof.isError ? ok('profile (чтение) работает') : bad(`profile: ${ptxt.slice(0,120)}`);

  // запись без личного вебхука → блок гарда
  const w = await client.callTool({ name: 'b24_call', arguments: { method: 'crm.deal.add', params: { fields: { TITLE: 'x' } } } });
  /READONLY|только чтени/i.test(w.content?.[0]?.text || '') ? ok('запись без вебхука заблокирована') : bad(`ожидался блок: ${(w.content?.[0]?.text||'').slice(0,120)}`);
  await transport.close();
}

// 2) с заголовком X-B24-Webhook чужого портала → SSRF-ошибка (значит заголовок ДОЛЕТЕЛ)
{
  const { client, transport } = await connect({ 'X-B24-Webhook': 'https://evil.example.com/rest/1/tok/' });
  const w = await client.callTool({ name: 'b24_call', arguments: { method: 'crm.deal.add', params: { fields: { TITLE: 'x' } } } });
  const t = w.content?.[0]?.text || '';
  /портал|SSRF/i.test(t) ? ok('заголовок X-B24-Webhook долетел до сервера (SSRF-валидация сработала)') : bad(`ожидалась ошибка портала: ${t.slice(0,140)}`);
  await transport.close();
}

console.log(`\n${fail ? '✗' : '✓'} smoke: ${fail} fail`);
process.exit(fail ? 1 : 0);
