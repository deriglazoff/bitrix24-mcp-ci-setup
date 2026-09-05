import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import { fetchListPage, listPayload, resolveSelect, LIST_LIMIT_FIELD, LIST_START_FIELD } from '../utils/pagination.js';
import { resolveWebhook, createClient, PERSONAL_WEBHOOK_FIELD } from '../utils/resolve-webhook.js';

// ─── LIST PRODUCTS ────────────────────────────────────────────────────────────

export const productsListSchema = z.object({
  filter: z.record(z.any()).optional().default({}).describe(
    'Filtros. Ejemplo: { "SECTION_ID": 5, "ACTIVE": "Y" } ' +
    'o { ">=PRICE": 100, "<=PRICE": 500 } para rango de precios'
  ),
  select: z.array(z.string()).optional().describe(
    'Campos a retornar. Default: ID, NAME, ACTIVE, PRICE, CURRENCY_ID, SECTION_ID'
  ),
  all_pages: z.boolean().optional().default(false),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

const PRODUCTS_DEFAULT_SELECT = ['ID', 'NAME', 'ACTIVE', 'PRICE', 'CURRENCY_ID', 'SECTION_ID'];

export async function productsList({ filter = {}, select, all_pages = false, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const selectParam = resolveSelect(select, PRODUCTS_DEFAULT_SELECT);
  const params = {
    filter,
    ...(selectParam ? { select: selectParam } : {}),
  };
  const page = await fetchListPage(client, 'catalog.product.list', params, { all_pages, limit, start });
  return listPayload('products', page, { portal: client.portal });
}

// ─── GET PRODUCT ──────────────────────────────────────────────────────────────

export const productsGetSchema = z.object({
  id: z.union([z.string(), z.number()]).describe('ID del producto'),
  webhook_url: z.string().url().optional(),
});

export async function productsGet({ id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('catalog.product.get', { id });
  return { portal: client.portal, product: res.result };
}

// ─── CREATE PRODUCT ───────────────────────────────────────────────────────────

export const productsCreateSchema = z.object({
  fields: z.record(z.any()).describe(
    'Campos del producto. Requeridos: NAME. ' +
    'Opcionales: ACTIVE, PRICE, CURRENCY_ID, DESCRIPTION, SECTION_ID, PREVIEW_PICTURE'
  ),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function productsCreate({ fields, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const res = await client.call('catalog.product.add', { fields });
  return { portal: client.portal, created_id: res.result, success: true };
}

// ─── UPDATE PRODUCT ───────────────────────────────────────────────────────────

export const productsUpdateSchema = z.object({
  id: z.union([z.string(), z.number()]),
  fields: z.record(z.any()).describe('Campos a actualizar'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function productsUpdate({ id, fields, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  await client.call('catalog.product.update', { id, fields });
  return { portal: client.portal, updated_id: id, success: true };
}

// ─── LIST SECTIONS ────────────────────────────────────────────────────────────

export const productsSectionsSchema = z.object({
  catalog_id: z.union([z.string(), z.number()]).optional().describe('ID del catálogo (opcional)'),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

export async function productsSections({ catalog_id, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const params = catalog_id ? { filter: { CATALOG_ID: catalog_id } } : {};
  const page = await fetchListPage(client, 'catalog.section.list', params, { limit, start });
  return listPayload('sections', page, { portal: client.portal });
}
