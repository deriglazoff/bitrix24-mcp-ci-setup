import { z } from 'zod';

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;
export const MAX_ALL_PAGES_ITEMS = 200;
export const BITRIX_PAGE_SIZE = 50;

export const LIST_LIMIT_FIELD = z.number().int().min(1).max(MAX_LIST_LIMIT).optional().default(DEFAULT_LIST_LIMIT)
  .describe('Макс. записей в ответе (1–50). Дальше — start.');
export const LIST_START_FIELD = z.number().int().min(0).optional().default(0)
  .describe('Смещение Bitrix (start).');

const NESTED_LIST_KEYS = ['items', 'tasks', 'products', 'sections', 'users', 'groups', 'departments'];

export function extractItems(result) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];
  for (const key of NESTED_LIST_KEYS) {
    if (Array.isArray(result[key])) return result[key];
  }
  // crm.category.list / catalog.catalog.list часто отдают { categories: [...] } и т.п.
  const arrayVals = Object.values(result).filter(Array.isArray);
  if (arrayVals.length === 1) return arrayVals[0];
  return [];
}

export function defaultCrmSelect(entity, entityTypeId) {
  if (entityTypeId) return ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID'];
  switch ((entity || '').toLowerCase()) {
    case 'contact':
      return ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL'];
    case 'company':
      return ['ID', 'TITLE', 'ASSIGNED_BY_ID'];
    case 'deal':
    case 'lead':
    case 'quote':
    case 'invoice':
      return ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_MODIFY'];
    default:
      return ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID'];
  }
}

// select: ["*"] — не передавать select в Bitrix (все поля, как раньше).
// пусто / не задан — fallback. иначе — как передали.
export function resolveSelect(select, fallback) {
  if (!select || select.length === 0) return fallback;
  if (select.length === 1 && select[0] === '*') return undefined;
  return select;
}

export function slicePage(items, { limit = DEFAULT_LIST_LIMIT, start = 0, total } = {}) {
  const capped = Math.min(Math.max(1, limit), MAX_LIST_LIMIT);
  const page = items.slice(0, capped);
  const tot = total ?? items.length;
  const next = start + page.length;
  const truncated = next < tot || items.length > capped;
  return {
    items: page,
    count: page.length,
    total: tot,
    start,
    truncated,
    ...(truncated ? { next_start: next } : {}),
  };
}

export function listPayload(key, page, extra = {}) {
  const { items, count, total, start, truncated, next_start } = page;
  return {
    ...extra,
    count,
    total,
    start,
    truncated,
    ...(next_start != null ? { next_start } : {}),
    [key]: items,
  };
}

export async function fetchAllPages(client, method, params = {}, { maxItems = Infinity } = {}) {
  const results = [];
  let start = params.start ?? 0;

  while (results.length < maxItems) {
    const response = await client.call(method, { ...params, start });
    const items = extractItems(response.result);

    if (!items.length) break;
    results.push(...items);

    const total = response.total ?? 0;
    start += BITRIX_PAGE_SIZE;
    if (start >= total || items.length < BITRIX_PAGE_SIZE) break;
  }

  return Number.isFinite(maxItems) ? results.slice(0, maxItems) : results;
}

export async function fetchListPage(client, method, params, {
  all_pages = false,
  limit = DEFAULT_LIST_LIMIT,
  start = 0,
  maxItems = MAX_ALL_PAGES_ITEMS,
} = {}) {
  if (all_pages) {
    const all = await fetchAllPages(client, method, { ...params }, { maxItems });
    const truncated = all.length >= maxItems;
    return {
      items: all,
      count: all.length,
      total: all.length,
      start: 0,
      truncated,
      ...(truncated ? { next_start: all.length } : {}),
    };
  }

  const cappedLimit = Math.min(Math.max(1, limit), MAX_LIST_LIMIT);
  const res = await client.call(method, { ...params, start });
  const raw = extractItems(res.result);
  const total = res.total ?? raw.length;
  return slicePage(raw, { limit: cappedLimit, start, total });
}
