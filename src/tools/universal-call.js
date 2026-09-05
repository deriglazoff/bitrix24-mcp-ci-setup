import { z } from 'zod';
import { createClient, PERSONAL_WEBHOOK_FIELD } from '../utils/resolve-webhook.js';

export const callSchema = z.object({
  method: z.string().describe(
    'Método REST de Bitrix24. Ejemplos: crm.deal.list, tasks.task.add, disk.folder.getchildren, im.notify.personal.add'
  ),
  params: z.record(z.any()).optional().default({}).describe(
    'Parámetros del método como objeto JSON. Ejemplo: { "filter": { "STAGE_ID": "WON" }, "select": ["ID","TITLE"] }'
  ),
  webhook_url: z.string().url().optional().describe('Webhook opcional, usa el default si no se indica'),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function universalCall({ method, params = {}, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const response = await client.call(method, params);
  return {
    method,
    portal: client.portal,
    result: response.result,
    total: response.total ?? null,
    next: response.next ?? null,
  };
}

// ─── Batch ────────────────────────────────────────────────────────────────────

export const batchSchema = z.object({
  calls: z.record(z.object({
    method: z.string(),
    params: z.record(z.any()).optional().default({}),
  })).describe(
    'Objeto donde cada clave es un alias y el valor es { method, params }. ' +
    'Los params pueden referenciar resultados previos con $result[alias][campo]. ' +
    'Ejemplo: { "deals": { "method": "crm.deal.list", "params": { "filter": { "STAGE_ID": "NEW" } } } }'
  ),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function universalBatch({ calls, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });

  // Bitrix24 batch format
  const cmd = {};
  for (const [alias, call] of Object.entries(calls)) {
    const paramStr = Object.entries(call.params || {})
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v)}`)
      .join('&');
    cmd[alias] = `${call.method}?${paramStr}`;
  }

  const response = await client.call('batch', { cmd, halt: 0 });
  return {
    portal: client.portal,
    result: response.result?.result ?? response.result,
    errors: response.result?.result_error ?? {},
    total: response.result?.result_total ?? {},
  };
}
