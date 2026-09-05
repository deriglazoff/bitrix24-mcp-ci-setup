import { z } from 'zod';
import axios from 'axios';
import { writeFile } from 'node:fs/promises';
import { Bitrix24Client } from '../bitrix24/client.js';
import { resolveWebhook, createClient, PERSONAL_WEBHOOK_FIELD } from '../utils/resolve-webhook.js';
import { slicePage, listPayload, LIST_LIMIT_FIELD, LIST_START_FIELD } from '../utils/pagination.js';

// ─── ACCESS_DENIED helper ─────────────────────────────────────────────────────
// Доступ к файлам, прикреплённым в чатах задач, Bitrix24 проверяет по членству
// в задаче/чате, а НЕ по правам на Диск. Если пользователь вебхука не участник —
// disk.file.get/getchildren отвечает ACCESS_DENIED (HTTP 403). Generic-текст
// ошибки агенту ни о чём не говорит, поэтому подменяем его понятной инструкцией
// для оператора (её агент дословно передаёт пользователю).

function isAccessDenied(err) {
  const code = err?.response?.data?.error;
  return code === 'ACCESS_DENIED' || /ACCESS_DENIED/i.test(err?.message || '');
}

function accessDeniedFileError(file_id) {
  return new Error(
    `ACCESS_DENIED: нет доступа к файлу ${file_id}.\n` +
    `Причина: файл прикреплён в ЧАТЕ ЗАДАЧИ, а пользователь вебхука не участник этой задачи/чата. ` +
    `Доступ к файлам чатов в Bitrix24 определяется членством в задаче/чате, а НЕ правами на Диск, ` +
    `поэтому открытие доступа к Диску эту ошибку НЕ снимает.\n\n` +
    `ИНСТРУКЦИЯ ОПЕРАТОРУ (как открыть доступ):\n` +
    `1) Найдите задачу-ВЛАДЕЛЬЦА чата, где лежит файл. Важно: это может быть РОДИТЕЛЬСКАЯ задача, ` +
    `а не та, что в ссылке/описании (entity_id чата смотрите через im.dialog.get → поле entity_id).\n` +
    `2) Добавьте пользователя вебхука НАБЛЮДАТЕЛЕМ (или соисполнителем) в эту задачу — он автоматически ` +
    `станет участником чата.\n` +
    `3) Повторите запрос b24_disk_file_get — вернётся поле DOWNLOAD_URL для скачивания.\n` +
    `Альтернатива без изменения задачи: передать personal_webhook участника чата в параметрах вызова.`
  );
}

// ─── LIST STORAGE ─────────────────────────────────────────────────────────────

export const diskStoragesSchema = z.object({
  webhook_url: z.string().url().optional(),
});

export async function diskStorages({ webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));
  const res = await client.call('disk.storage.getlist');
  return { portal: client.portal, storages: res.result ?? [] };
}

// ─── LIST FOLDER CHILDREN ────────────────────────────────────────────────────

export const diskFolderListSchema = z.object({
  folder_id: z.union([z.string(), z.number()]).optional().describe('ID de la carpeta. Si no se indica, lista el storage raíz del usuario'),
  filter: z.record(z.any()).optional().default({}).describe('Filtros opcionales. Ejemplo: { "NAME": "Contratos" }'),
  limit: LIST_LIMIT_FIELD,
  start: LIST_START_FIELD,
  webhook_url: z.string().url().optional(),
});

export async function diskFolderList({ folder_id, filter = {}, limit, start, webhook_url }) {
  const client = new Bitrix24Client(resolveWebhook(webhook_url));

  if (!folder_id) {
    // Get user's personal storage root
    const storageRes = await client.call('disk.storage.getforapp');
    folder_id = storageRes.result?.ROOT_OBJECT?.ID;
  }

  const res = await client.call('disk.folder.getchildren', { id: folder_id, filter });
  const mapped = (res.result ?? []).map(i => ({
    id: i.ID, name: i.NAME, type: i.TYPE, size: i.SIZE,
    created: i.CREATE_TIME, modified: i.UPDATE_TIME,
    download_url: i.DOWNLOAD_URL,
  }));
  const page = slicePage(mapped.slice(start), { limit, start, total: mapped.length });
  return listPayload('items', page, { portal: client.portal, folder_id });
}

// ─── GET FILE ────────────────────────────────────────────────────────────────

export const diskFileGetSchema = z.object({
  file_id: z.union([z.string(), z.number()]).describe('ID del archivo (params.FILE_ID del mensaje de chat)'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function diskFileGet({ file_id, webhook_url, personal_webhook }) {
  // personal_webhook позволяет читать файл под учёткой участника чата, когда
  // пользователь общего вебхука доступа к чату задачи не имеет.
  const client = personal_webhook
    ? createClient({ webhook_url, personal_webhook })
    : new Bitrix24Client(resolveWebhook(webhook_url));
  try {
    const res = await client.call('disk.file.get', { id: file_id });
    return { portal: client.portal, file: res.result };
  } catch (err) {
    if (isAccessDenied(err)) throw accessDeniedFileError(file_id);
    throw err;
  }
}

// ─── GET FILE CONTENT (descarga server-side) ──────────────────────────────────
// El DOWNLOAD_URL del Disk suele estar bloqueado por el WAF/web del portal para
// IPs externas (devuelve un 403 HTML, no JSON), así que un cliente remoto no puede
// bajar los bytes aunque tenga la URL. Este tool hace la descarga DESDE EL SERVIDOR
// MCP (host permitido) y devuelve el contenido en base64, o lo guarda en save_to.

export const diskFileContentSchema = z.object({
  file_id: z.union([z.string(), z.number()]).describe('ID del archivo (params.FILE_ID del mensaje de chat)'),
  save_to: z.string().optional().describe('Ruta ABSOLUTA en el servidor donde guardar el archivo. Si se indica, no se devuelve base64 (útil para archivos grandes).'),
  max_size_mb: z.number().optional().default(25).describe('Límite de tamaño para devolver base64 (MB). Por encima, usar save_to. Default 25.'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function diskFileContent({ file_id, save_to, max_size_mb = 25, webhook_url, personal_webhook }) {
  const client = personal_webhook
    ? createClient({ webhook_url, personal_webhook })
    : new Bitrix24Client(resolveWebhook(webhook_url));

  // 1) Metadatos + DOWNLOAD_URL (mismo manejo de ACCESS_DENIED que diskFileGet).
  let file;
  try {
    const res = await client.call('disk.file.get', { id: file_id });
    file = res.result;
  } catch (err) {
    if (isAccessDenied(err)) throw accessDeniedFileError(file_id);
    throw err;
  }
  const url = file?.DOWNLOAD_URL;
  if (!url) throw new Error(`disk.file.get no devolvió DOWNLOAD_URL para el archivo ${file_id}.`);

  // SSRF-guard: solo descargar del mismo portal que el webhook.
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('DOWNLOAD_URL inválida.'); }
  if (host !== client.portal) {
    throw new Error(`DOWNLOAD_URL apunta a un host distinto (${host} ≠ ${client.portal}); descarga abortada.`);
  }

  // Guard de tamaño cuando se devuelve base64 (save_to no tiene este límite).
  const sizeBytes = Number(file.SIZE) || 0;
  const limit = max_size_mb * 1024 * 1024;
  if (!save_to && sizeBytes && sizeBytes > limit) {
    throw new Error(
      `El archivo "${file.NAME}" pesa ${(sizeBytes / 1048576).toFixed(1)} MB y supera max_size_mb=${max_size_mb}. ` +
      `Aumentá max_size_mb o usá save_to para guardarlo en disco del servidor.`
    );
  }

  // 2) Descarga server-side (este host sí tiene acceso al endpoint /download/).
  let resp;
  try {
    resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  } catch (err) {
    const status = err.response?.status;
    // En esta etapa los metadatos YA se obtuvieron (tenemos DOWNLOAD_URL), así que
    // un 403 en la descarga = filtro de RED/WAF del portal sobre /download/, atado al
    // IP de ORIGEN, NO a identidad/permisos/membresía (probado: bot, webhook personal
    // de un miembro del chat, archivo de disco común y enlace público — todos 403).
    if (status === 403) {
      throw new Error(
        `DOWNLOAD bloqueado por el portal (HTTP 403) para el archivo ${file_id}. ` +
        `Los metadatos se leen, pero el endpoint /download/ devuelve un 403 HTML genérico. ` +
        `Causa: filtro de RED/WAF del portal sobre la ruta /download/, atado al IP de ORIGEN de la petición — ` +
        `NO depende de la identidad, permisos ni membresía en el chat (un navegador con sesión desde la red permitida sí descarga).\n\n` +
        `INSTRUCCIÓN PARA EL OPERADOR:\n` +
        `1) Ejecutar este servidor MCP en un host cuyo IP de salida esté permitido por el portal para /rest/*/download/, o\n` +
        `2) Pedir al admin del portal que agregue el IP de salida de este host MCP al whitelist de /download/, o\n` +
        `3) Usar una app OAuth local (scope disk) / un método REST propio en Bitrix que lea el archivo de /upload/ y devuelva base64.`
      );
    }
    throw new Error(
      `No se pudo descargar el archivo ${file_id} desde DOWNLOAD_URL` +
      (status ? ` (HTTP ${status})` : '') + `: ${err.message}.`
    );
  }

  const buffer = Buffer.from(resp.data);
  const meta = {
    portal: client.portal,
    file_id: String(file_id),
    name: file.NAME,
    size: buffer.length,
    mime: resp.headers['content-type'] || null,
  };

  if (save_to) {
    await writeFile(save_to, buffer);
    return { ...meta, saved_to: save_to, content_base64: null };
  }
  return { ...meta, content_base64: buffer.toString('base64') };
}

// ─── UPLOAD FILE ─────────────────────────────────────────────────────────────

export const diskFileUploadSchema = z.object({
  folder_id: z.union([z.string(), z.number()]).describe('ID de la carpeta destino'),
  name: z.string().describe('Nombre del archivo incluyendo extensión'),
  content_base64: z.string().describe('Contenido del archivo en Base64'),
  webhook_url: z.string().url().optional(),
  personal_webhook: PERSONAL_WEBHOOK_FIELD,
});

export async function diskFileUpload({ folder_id, name, content_base64, webhook_url, personal_webhook }) {
  const client = createClient({ webhook_url, personal_webhook });
  const res = await client.call('disk.folder.uploadfile', {
    id: folder_id,
    data: { NAME: name },
    fileContent: content_base64,
  });
  return { portal: client.portal, file: res.result, success: true };
}
