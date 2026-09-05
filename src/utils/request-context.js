import { AsyncLocalStorage } from 'node:async_hooks';

// Контекст одного MCP-вызова. wrap() кладёт сюда заголовки запроса (из
// extra.requestInfo.headers), чтобы resolveTarget мог достать личный вебхук,
// переданный в заголовке соединения, БЕЗ изменения сигнатур всех обработчиков.
export const requestContext = new AsyncLocalStorage();

// Имя заголовка с личным write-вебхуком (нижний регистр — заголовки нормализуются).
const WEBHOOK_HEADER = 'x-b24-webhook';

// Возвращает значение заголовка с личным вебхуком для текущего вызова, либо null.
export function headerWebhook() {
  const headers = requestContext.getStore()?.headers;
  if (!headers) return null;
  // Node req.headers и Headers.entries() дают ключи в нижнем регистре; на всякий
  // случай проверяем и исходный регистр.
  const v = headers[WEBHOOK_HEADER] ?? headers['X-B24-Webhook'];
  return (typeof v === 'string' && v.trim()) ? v.trim() : null;
}
