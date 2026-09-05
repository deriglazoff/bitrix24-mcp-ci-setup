import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools, SERVER_INSTRUCTIONS } from './src/register-tools.js';

// stdio-вход (локальный MCP-клиент). HTTP-шлюз — см. server-http.js.
const server = new McpServer({ name: 'bitrix24-config', version: '2.0.0' }, { instructions: SERVER_INSTRUCTIONS });
registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

// Auto-test de conexión al arrancar
if (process.env.B24_DEFAULT_WEBHOOK) {
  try {
    const { Bitrix24Client } = await import('./src/bitrix24/client.js');
    const client = new Bitrix24Client(process.env.B24_DEFAULT_WEBHOOK);
    const res = await client.call('profile');
    const name = `${res.result?.NAME || ''} ${res.result?.LAST_NAME || ''}`.trim();
    process.stderr.write(`[bitrix24] ✓ Conectado a ${client.portal} como ${name} | ${Object.keys(server._registeredTools ?? {}).length || 44} tools activos\n`);
  } catch (err) {
    process.stderr.write(`[bitrix24] ✗ No se pudo conectar: ${err.message}\n`);
  }
}
