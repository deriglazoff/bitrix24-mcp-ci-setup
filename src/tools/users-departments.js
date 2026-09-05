import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { fetchListPage, listPayload, resolveSelect, LIST_LIMIT_FIELD, LIST_START_FIELD } from '../utils/pagination.js';
import { resolveWebhook } from '../utils/resolve-webhook.js';

// ─── USERS ────────────────────────────────────────────────────────────────────

export const usersListSchema = z.object({
  filter: z.record(z.any()).optional().default({ ACTIVE: true }).describe(
    'Filtros. Default: { ACTIVE: true }. Otros: { "UF_DEPARTMENT": 5, "NAME": "Brian" }'
  ),
  select: z.array(z.string()).optional().describe(
    'Campos a retornar. Default: ID, NAME, LAST_NAME, EMAIL, WORK_POSITION, UF_DEPARTMENT, IS_ONLINE'
  ),
  all_pages: z.boolean().optional().default(false),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

const USERS_DEFAULT_SELECT = ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'WORK_POSITION', 'UF_DEPARTMENT', 'IS_ONLINE'];

export async function usersList({ filter = { ACTIVE: true }, select, all_pages = false, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const selectParam = resolveSelect(select, USERS_DEFAULT_SELECT);
  const params = {
    filter,
    ...(selectParam ? { select: selectParam } : {}),
  };
  const page = await fetchListPage(client, 'user.get', params, { all_pages, limit, start });
  return listPayload('users', page, { portal: client.portal });
}

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────

export const departmentsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "PARENT": 5 } para subdepartamentos. { "NAME": "Ventas" } para buscar por nombre'
  ),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

export async function departmentsList({ filter = {}, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const page = await fetchListPage(client, 'department.get', filter, { limit, start });
  return listPayload('departments', page, { portal: client.portal });
}
