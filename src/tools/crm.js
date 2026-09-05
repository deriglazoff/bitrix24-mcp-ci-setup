import { z } from 'zod';
import { Bitrix24Client } from '../bitrix24/client.js';
import {
  fetchListPage, listPayload, defaultCrmSelect, resolveSelect,
  LIST_LIMIT_FIELD, LIST_START_FIELD,
} from '../utils/pagination.js';
import { resolveWebhook, createClient, PERSONAL_WEBHOOK_FIELD } from '../utils/resolve-webhook.js';

// Mapa de entidad a método base de la REST API
const ENTITY_METHOD = {
  deal:     'crm.deal',
  contact:  'crm.contact',
  company:  'crm.company',
  lead:     'crm.lead',
  quote:    'crm.quote',
  invoice:  'crm.invoice',
  order:    'sale.order',
  // SPA / Smart Process usa crm.item con entityTypeId
};

function resolveMethod(entity, entityTypeId) {
  if (entityTypeId) return { base: 'crm.item', extra: { entityTypeId } };
  const base = ENTITY_METHOD[entity?.toLowerCase()];
  if (!base) throw new Error(`Entidad desconocida: "${entity}". Usá deal, contact, company, lead, quote, invoice, o pasá entityTypeId para SPA.`);
  return { base, extra: {} };
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

export const crmListSchema = z.object({
  entity: z.string().optional().describe('Tipo de entidad: deal, contact, company, lead, quote, invoice'),
  entity_type_id: z.number().int().optional().describe('ID de SPA (Smart Process). Alternativa a entity para procesos personalizados'),
  filter: z.record(z.any()).optional().default({}).describe('Filtros. Ejemplo: { "STAGE_ID": "WON", ">DATE_CREATE": "2026-01-01" }'),
  select: z.array(z.string()).optional().describe('Campos a retornar. Default зависит от entity. ["*"] — все поля включая UF_*'),
  order: z.record(z.string()).optional().describe('Ordenamiento. Ejemplo: { "DATE_CREATE": "DESC" }'),
  all_pages: z.boolean().optional().default(false).describe('Si true, trae до 200 записей. Иначе — одна страница с limit'),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

export async function crmList({ entity, entity_type_id, filter = {}, select, order, all_pages = false, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const { base, extra } = resolveMethod(entity, entity_type_id);
  const selectParam = resolveSelect(select, defaultCrmSelect(entity, entity_type_id));
  const params = { filter, ...extra, ...(selectParam ? { select: selectParam } : {}), ...(order ? { order } : {}) };

  const page = await fetchListPage(client, `${base}.list`, params, { all_pages, limit, start });
  return listPayload('items', page, {
    entity: entity || `SPA_${entity_type_id}`,
    portal: client.portal,
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export const crmGetSchema = z.object({
  entity: z.string().optional(),
  entity_type_id: z.number().int().optional(),
  id: z.union([z.string(), z.number()]).describe('ID del registro'),
  webhook_url: z.string().url().optional(),
});

export async function crmGet({ entity, entity_type_id, id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const { base, extra } = resolveMethod(entity, entity_type_id);
  const res = await client.call(`${base}.get`, { id, ...extra });
  return { entity: entity || `SPA_${entity_type_id}`, portal: client.portal, item: res.result?.item ?? res.result };
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export const crmCreateSchema = z.object({
  entity: z.string().optional(),
  entity_type_id: z.number().int().optional(),
  fields: z.record(z.any()).describe('Campos del registro a crear. Ejemplo: { "TITLE": "Nuevo deal", "STAGE_ID": "NEW", "ASSIGNED_BY_ID": 1 }'),
  params: z.record(z.any()).optional().describe('Parámetros adicionales del método (ej: REGISTER_SONET_EVENT)'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function crmCreate({ entity, entity_type_id, fields, params = {}, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const { base, extra } = resolveMethod(entity, entity_type_id);
  const res = await client.call(`${base}.add`, { fields: { ...fields, ...extra }, params });
  const id = res.result?.item?.id ?? res.result;
  return { entity: entity || `SPA_${entity_type_id}`, portal: client.portal, created_id: id };
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const crmUpdateSchema = z.object({
  entity: z.string().optional(),
  entity_type_id: z.number().int().optional(),
  id: z.union([z.string(), z.number()]),
  fields: z.record(z.any()).describe('Campos a actualizar'),
  params: z.record(z.any()).optional(),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function crmUpdate({ entity, entity_type_id, id, fields, params = {}, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const { base, extra } = resolveMethod(entity, entity_type_id);
  await client.call(`${base}.update`, { id, fields, params, ...extra });
  return { entity: entity || `SPA_${entity_type_id}`, portal: client.portal, updated_id: id, success: true };
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const crmDeleteSchema = z.object({
  entity: z.string().optional(),
  entity_type_id: z.number().int().optional(),
  id: z.union([z.string(), z.number()]),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function crmDelete({ entity, entity_type_id, id, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const { base, extra } = resolveMethod(entity, entity_type_id);
  await client.call(`${base}.delete`, { id, ...extra });
  return { entity: entity || `SPA_${entity_type_id}`, portal: client.portal, deleted_id: id, success: true };
}

// ─── FIELDS ───────────────────────────────────────────────────────────────────

export const crmFieldsSchema = z.object({
  entity: z.string().optional().describe('Tipo de entidad: deal, contact, company, lead'),
  entity_type_id: z.number().int().optional().describe('ID de SPA'),
  webhook_url: z.string().url().optional(),
});

export async function crmFields({ entity, entity_type_id, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const { base, extra } = resolveMethod(entity, entity_type_id);
  const res = await client.call(`${base}.fields`, extra);
  const fields = res.result?.fields ?? res.result ?? {};
  const fieldList = Object.entries(fields).map(([code, def]) => ({ code, ...def }));
  return {
    entity: entity || `SPA_${entity_type_id}`,
    portal: client.portal,
    total_fields: fieldList.length,
    fields: fieldList,
  };
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────────

export const timelineAddSchema = z.object({
  entity: z.string().describe('Tipo de entidad CRM: deal, contact, company, lead'),
  entity_id: z.union([z.string(), z.number()]).describe('ID del registro CRM'),
  comment: z.string().describe('Texto del comentario a agregar en la línea de tiempo'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function timelineAdd({ entity, entity_id, comment, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const entityMap = { deal: 'CRM_DEAL', contact: 'CRM_CONTACT', company: 'CRM_COMPANY', lead: 'CRM_LEAD' };
  const entityCode = entityMap[entity?.toLowerCase()] ?? entity.toUpperCase();
  const res = await client.call('crm.timeline.comment.add', {
    fields: { ENTITY_ID: entity_id, ENTITY_TYPE: entityCode, COMMENT: comment },
  });
  return { portal: client.portal, entity, entity_id, comment_id: res.result, success: true };
}
