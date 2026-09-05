import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { isReadOnly } from '../bitrix24/readonly.js';
import { headerWebhook } from './request-context.js';

// Общий вебхук (B24_DEFAULT_WEBHOOK) — read-only для MCP и всех агентов.
// Чтобы выполнить ЗАПИСЬ, агент передаёт свой ЛИЧНЫЙ входящий webhook в параметре
// personal_webhook: операция идёт под его учётной записью и его правами, общий
// вебхук при этом не получает прав на запись.

// zod-поле для write-инструментов (и b24_call/b24_batch).
export const PERSONAL_WEBHOOK_FIELD = z.string().url().optional().describe(
  'Личный webhook для записи (иначе read-only). https://<portal>/rest/<id>/<token>/.'
);

// Проверяет личный вебхук: https, тот же портал, что B24_DEFAULT_WEBHOOK,
// и формат входящего вебхука /rest/<id>/<token>/. Возвращает URL или бросает.
function validatePersonalWebhook(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { throw new Error('personal_webhook: некорректный URL.'); }
  if (u.protocol !== 'https:') {
    throw new Error('personal_webhook: разрешён только https.');
  }
  const def = process.env.B24_DEFAULT_WEBHOOK;
  const defHost = def ? new URL(def).hostname : null;
  if (defHost && u.hostname !== defHost) {
    throw new Error(`personal_webhook: разрешён только портал ${defHost} (защита от SSRF).`);
  }
  if (!/^\/rest\/\d+\/[A-Za-z0-9]+\/?$/.test(u.pathname)) {
    throw new Error('personal_webhook: ожидается формат входящего вебхука /rest/<id>/<token>/.');
  }
  return url;
}

// Возвращает { url, readOnly } для построения клиента.
// Личный вебхук разрешает запись под учёткой владельца. Источник (по приоритету):
//   1) параметр personal_webhook в самом вызове;
//   2) заголовок соединения X-B24-Webhook (задаётся один раз в конфиге клиента).
// Иначе → общий вебхук, read-only по глобальному правилу (fail-safe).
export function resolveTarget({ webhook_url, personal_webhook } = {}) {
  const personal = validatePersonalWebhook(personal_webhook ?? headerWebhook());
  if (personal) {
    return { url: personal, readOnly: false };
  }
  // На общем вебхуке per-call override webhook_url в read-only игнорируется
  // (защита от SSRF и подмены портала).
  const base = isReadOnly() ? null : webhook_url;
  const url = base || process.env.B24_DEFAULT_WEBHOOK;
  if (!url) {
    throw new Error(
      'No se especificó webhook y no hay B24_DEFAULT_WEBHOOK configurado. ' +
      'Pasá personal_webhook (para escritura) o configurá B24_DEFAULT_WEBHOOK en el servidor.'
    );
  }
  return { url, readOnly: isReadOnly() };
}

// Фабрика клиента с корректным per-call read-only флагом.
export function createClient(opts = {}) {
  const { url, readOnly } = resolveTarget(opts);
  return new Bitrix24Client(url, { readOnly });
}

// Совместимость: read-инструменты используют общий вебхук (read-only по умолчанию).
export function resolveWebhook(webhookParam) {
  return resolveTarget({ webhook_url: webhookParam }).url;
}
