// Компактный JSON для MCP-ответов + потолок размера, чтобы list/fields/call
// не забивали контекст модели десятками тысяч токенов.

export const MAX_RESPONSE_CHARS = 80_000;

export const TRUNCATE_ARRAY_KEYS = [
  'items', 'tasks', 'users', 'products', 'fields', 'groups',
  'departments', 'events', 'calls', 'storages', 'workflows',
  'result', 'sections',
];

function findLargestTruncatableArray(obj) {
  let best = null;
  if (!obj || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    for (const el of obj) {
      const nested = findLargestTruncatableArray(el);
      if (nested && (!best || nested.arr.length > best.arr.length)) best = nested;
    }
    return best;
  }

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val) && TRUNCATE_ARRAY_KEYS.includes(key) && val.length > 0) {
      if (!best || val.length > best.arr.length) best = { parent: obj, key, arr: val };
    }
    if (val && typeof val === 'object') {
      const nested = findLargestTruncatableArray(val);
      if (nested && (!best || nested.arr.length > best.arr.length)) best = nested;
    }
  }
  return best;
}

function markOriginalTotals(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const el of obj) markOriginalTotals(el);
    return;
  }
  for (const key of TRUNCATE_ARRAY_KEYS) {
    if (Array.isArray(obj[key]) && obj.total == null) obj.total = obj[key].length;
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object') markOriginalTotals(val);
  }
}

export function truncateResult(result, maxChars = MAX_RESPONSE_CHARS) {
  if (result == null || typeof result !== 'object') return result;

  let text = JSON.stringify(result);
  if (text.length <= maxChars) return result;

  const out = JSON.parse(text);
  markOriginalTotals(out);

  while (JSON.stringify(out).length > maxChars) {
    const found = findLargestTruncatableArray(out);
    if (!found) break;
    if (found.arr.length <= 1) {
      found.parent[found.key] = [{ truncated: true, note: 'item exceeds max response size' }];
      found.parent.truncated = true;
      found.parent.returned = 0;
      break;
    }
    const keep = Math.max(1, Math.floor(found.arr.length / 2));
    found.parent[found.key] = found.arr.slice(0, keep);
    found.parent.truncated = true;
    found.parent.returned = keep;
  }

  return out;
}

export function stringifyMcpResult(result, maxChars = MAX_RESPONSE_CHARS) {
  const compact = JSON.stringify(result);
  if (compact.length <= maxChars) return compact;
  return JSON.stringify(truncateResult(result, maxChars));
}
