// Общая регистрация всех инструментов на McpServer.
// Используется и stdio-входом (index.js), и HTTP-сервером (server-http.js),
// чтобы набор инструментов и обёртка были едины.

import { requestContext } from './utils/request-context.js';
import { stringifyMcpResult } from './utils/mcp-response.js';

// Инструкция сервера — передаётся MCP-клиенту при инициализации (поле instructions).
// Описывает неочевидный процесс скачивания файлов из чатов задач и типовую ошибку
// доступа, чтобы агент сам понимал причину и передавал инструкцию оператору.
export const SERVER_INSTRUCTIONS =
  'Bitrix24 MCP. Descarga de archivos adjuntos en CHATS de tareas:\n' +
  '1) b24_call("im.dialog.messages.get", { DIALOG_ID: "chat<ID>" }) → en cada mensaje, params.FILE_ID es el ID del archivo.\n' +
  '2a) Si tu entorno puede alcanzar el portal: b24_disk_file_get(file_id) → descargá desde DOWNLOAD_URL.\n' +
  '2b) Si NO podés bajar desde DOWNLOAD_URL (WAF del portal devuelve 403 HTML a IPs externas): b24_disk_file_content(file_id), ' +
  'que descarga los bytes DESDE EL SERVIDOR MCP y los devuelve en base64 (o save_to).\n' +
  'REGLA DE ACCESO: el acceso a archivos de chats de tareas depende de la MEMBRESÍA del usuario del webhook ' +
  'en la tarea/chat dueño del archivo, NO de los permisos de Disk. Abrir el Disk NO resuelve un ACCESS_DENIED.\n' +
  'Si b24_disk_file_get devuelve ACCESS_DENIED, el mensaje de error ya contiene la instrucción para el operador ' +
  '(añadir al usuario del webhook como observador/coejecutor de la tarea dueña del chat — ojo: puede ser la tarea PADRE). ' +
  'Relata esa instrucción al operador tal cual. Alternativa: pasar personal_webhook de un participante del chat.';

// ── Universales ───────────────────────────────────────────────────────────────
import { callSchema, universalCall, batchSchema, universalBatch } from './tools/universal-call.js';

// ── CRM Datos ─────────────────────────────────────────────────────────────────
import {
  crmListSchema, crmList,
  crmGetSchema, crmGet,
  crmCreateSchema, crmCreate,
  crmUpdateSchema, crmUpdate,
  crmDeleteSchema, crmDelete,
  crmFieldsSchema, crmFields,
  timelineAddSchema, timelineAdd,
} from './tools/crm.js';

// ── CRM Config ────────────────────────────────────────────────────────────────
import { connectTestSchema, connectTest } from './tools/connect-test.js';
import { readConfigSchema, readFullConfig } from './tools/read-config.js';
import { readEntityTypesSchema, readEntityTypes } from './tools/read-entity-types.js';
import { readPipelinesSchema, readPipelines } from './tools/read-pipelines.js';
import { readCustomFieldsSchema, readCustomFields } from './tools/read-custom-fields.js';
import { readAutomationsSchema, readAutomations } from './tools/read-automations.js';
import { readProductCatalogSchema, readProductCatalog } from './tools/read-product-catalog.js';
import { compareConfigsSchema, compareConfigs } from './tools/compare-configs.js';
import { applyConfigSchema, applyConfig } from './tools/apply-config.js';
import { saveUserMappingSchema, saveUserMappingTool } from './tools/save-user-mapping.js';

// ── Tareas ────────────────────────────────────────────────────────────────────
import {
  tasksListSchema, tasksList,
  tasksGetSchema, tasksGet,
  tasksCreateSchema, tasksCreate,
  tasksUpdateSchema, tasksUpdate,
  tasksCompleteSchema, tasksComplete,
} from './tools/tasks.js';

// ── Usuarios y Departamentos ──────────────────────────────────────────────────
import { usersListSchema, usersList } from './tools/users-departments.js';
import { departmentsListSchema, departmentsList } from './tools/users-departments.js';

// ── Disco ─────────────────────────────────────────────────────────────────────
import {
  diskStoragesSchema, diskStorages,
  diskFolderListSchema, diskFolderList,
  diskFileGetSchema, diskFileGet,
  diskFileContentSchema, diskFileContent,
  diskFileUploadSchema, diskFileUpload,
} from './tools/disk.js';

// ── Calendario ────────────────────────────────────────────────────────────────
import { calendarListSchema, calendarList, calendarCreateSchema, calendarCreate } from './tools/calendar.js';

// ── Feed, Notificaciones, Grupos, BizProc, Telefonía ─────────────────────────
import {
  feedPostSchema, feedPost,
  notifySendSchema, notifySend,
  groupsListSchema, groupsList,
  chatSendSchema, chatSend,
  bizprocListSchema, bizprocList,
  bizprocStartSchema, bizprocStart,
  telephonyCallsSchema, telephonyCalls,
} from './tools/feed-notifications.js';

// ── Catálogo / Productos ──────────────────────────────────────────────────────
import {
  productsListSchema, productsList,
  productsGetSchema, productsGet,
  productsCreateSchema, productsCreate,
  productsUpdateSchema, productsUpdate,
  productsSectionsSchema, productsSections,
} from './tools/catalog-products.js';

// Оборачивает обработчик: кладёт заголовки запроса (extra.requestInfo.headers) в
// AsyncLocalStorage-контекст — чтобы resolveTarget мог достать личный вебхук из
// заголовка X-B24-Webhook. Для stdio extra.requestInfo нет → контекст пуст.
function wrap(fn) {
  return async (params, extra) => {
    const headers = extra?.requestInfo?.headers;
    try {
      const result = await requestContext.run({ headers }, () => fn(params));
      return { content: [{ type: 'text', text: stringifyMcpResult(result) }] };
    } catch (err) {
      const msg = err.response?.data
        ? `${err.message}\nBitrix24: ${JSON.stringify(err.response.data)}`
        : err.message;
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  };
}

export const ADMIN_TOOL_NAMES = [
  'b24_read_full_config',
  'b24_apply_config',
  'b24_compare_configs',
  'b24_save_user_mapping',
];

// daily (default / пусто / любое кроме full) — без admin-tools. full — все 44.
export function isDailyProfile() {
  const p = (process.env.B24_MCP_PROFILE || 'daily').trim().toLowerCase();
  return p !== 'full';
}

export function shouldRegisterTool(name) {
  return !(isDailyProfile() && ADMIN_TOOL_NAMES.includes(name));
}

// Регистрирует все инструменты на переданном McpServer.
// Write-инструменты публикуются ВСЕГДА (кроме admin в daily-профиле); защита от
// записи работает по-вызову на уровне клиента (assertReadOnly): на общем вебхуке
// запись блокируется, а при личном вебхуке (параметр personal_webhook или
// заголовок X-B24-Webhook) — разрешается под учёткой владельца.
export function registerAllTools(server) {
  const tool = (name, desc, shape, handler) => {
    if (!shouldRegisterTool(name)) return;
    server.tool(name, desc, shape, handler);
  };

  // ── Universales ───────────────────────────────────────────────────────────
  tool('b24_call',
    'Llama CUALQUIER método REST de la API de Bitrix24. Úsalo cuando no exista un tool específico. ' +
    'Referencia completa: https://dev.1c-bitrix.ru/rest_help/',
    callSchema.shape, wrap(universalCall));

  tool('b24_batch',
    'Ejecuta múltiples llamadas a la API de Bitrix24 en una sola request HTTP. ' +
    'Los resultados de una llamada pueden usarse como parámetros de la siguiente con $result[alias][campo].',
    batchSchema.shape, wrap(universalBatch));

  // ── Conexión ──────────────────────────────────────────────────────────────
  tool('b24_test_connection',
    'Verifica la conexión al webhook de Bitrix24 y confirma datos del portal y permisos del usuario.',
    connectTestSchema.shape, wrap(connectTest));

  // ── CRM Datos ─────────────────────────────────────────────────────────────
  tool('b24_crm_list',
    'Lista registros CRM: deals, contactos, empresas, leads, cotizaciones, o items de SPA. Soporta filtros, selección de campos y paginación automática.',
    crmListSchema.shape, wrap(crmList));

  tool('b24_crm_get',
    'Obtiene un registro CRM completo por ID: deal, contact, company, lead, o item de SPA.',
    crmGetSchema.shape, wrap(crmGet));

  tool('b24_crm_create',
    'Crea un nuevo registro CRM: deal, contact, company, lead, cotización, o item de SPA.',
    crmCreateSchema.shape, wrap(crmCreate));

  tool('b24_crm_update',
    'Actualiza campos de un registro CRM existente.',
    crmUpdateSchema.shape, wrap(crmUpdate));

  tool('b24_crm_delete',
    'Elimina un registro CRM por ID.',
    crmDeleteSchema.shape, wrap(crmDelete));

  tool('b24_crm_fields',
    'Lista todos los campos disponibles de una entidad CRM (estándar + personalizados) con sus tipos, etiquetas y configuración.',
    crmFieldsSchema.shape, wrap(crmFields));

  tool('b24_crm_timeline_add',
    'Agrega un comentario o actividad a la línea de tiempo de un registro CRM.',
    timelineAddSchema.shape, wrap(timelineAdd));

  // ── CRM Config ────────────────────────────────────────────────────────────
  tool('b24_read_full_config',
    'Lee TODA la configuración estructural de la instancia: entidades, pipelines, etapas, campos, automatizaciones, catálogo y usuarios. Exporta a JSON.',
    readConfigSchema.shape, wrap(readFullConfig));

  tool('b24_read_entity_types',
    'Lee todos los tipos de entidad CRM y SPA (Smart Process Automation) con sus atributos.',
    readEntityTypesSchema.shape, wrap(readEntityTypes));

  tool('b24_read_pipelines',
    'Lee pipelines (funnels) y sus etapas con colores, semántica y orden.',
    readPipelinesSchema.shape, wrap(readPipelines));

  tool('b24_read_custom_fields',
    'Lee campos personalizados de todas las entidades CRM con su configuración completa.',
    readCustomFieldsSchema.shape, wrap(readCustomFields));

  tool('b24_read_automations',
    'Lee reglas de automatización (robots y triggers) por etapa con condiciones y acciones.',
    readAutomationsSchema.shape, wrap(readAutomations));

  tool('b24_read_product_catalog',
    'Lee la estructura de configuración del catálogo de productos: secciones, propiedades, precios y unidades.',
    readProductCatalogSchema.shape, wrap(readProductCatalog));

  tool('b24_compare_configs',
    'Compara dos archivos JSON de configuración e informa qué existe en origen y no en destino, y viceversa.',
    compareConfigsSchema.shape, wrap(compareConfigs));

  tool('b24_apply_config',
    'Aplica una configuración exportada a una instancia destino. Crea si no existe, actualiza si existe, nunca elimina.',
    applyConfigSchema.shape, wrap(applyConfig));

  tool('b24_save_user_mapping',
    'Genera y guarda el mapeo de IDs de usuarios entre dos instancias, necesario para replicar automatizaciones.',
    saveUserMappingSchema.shape, wrap(saveUserMappingTool));

  // ── Tareas ────────────────────────────────────────────────────────────────
  tool('b24_tasks_list',
    'Lista tareas con filtros por responsable, grupo, estado, vencimiento, etc.',
    tasksListSchema.shape, wrap(tasksList));

  tool('b24_tasks_get',
    'Obtiene el detalle completo de una tarea por ID.',
    tasksGetSchema.shape, wrap(tasksGet));

  tool('b24_tasks_create',
    'Crea una nueva tarea con título, descripción, responsable, fecha límite, prioridad y más.',
    tasksCreateSchema.shape, wrap(tasksCreate));

  tool('b24_tasks_update',
    'Actualiza campos de una tarea existente.',
    tasksUpdateSchema.shape, wrap(tasksUpdate));

  tool('b24_tasks_complete',
    'Marca una tarea como completada.',
    tasksCompleteSchema.shape, wrap(tasksComplete));

  // ── Usuarios y Departamentos ──────────────────────────────────────────────
  tool('b24_users_list',
    'Lista usuarios activos con nombre, email, cargo, departamento y estado online.',
    usersListSchema.shape, wrap(usersList));

  tool('b24_departments_list',
    'Lista departamentos de la estructura organizativa con jerarquía y responsables.',
    departmentsListSchema.shape, wrap(departmentsList));

  // ── Disco ─────────────────────────────────────────────────────────────────
  tool('b24_disk_storages',
    'Lista todos los storages disponibles (personal, grupos, empresa).',
    diskStoragesSchema.shape, wrap(diskStorages));

  tool('b24_disk_folder_list',
    'Lista el contenido de una carpeta en el Disk de Bitrix24.',
    diskFolderListSchema.shape, wrap(diskFolderList));

  tool('b24_disk_file_get',
    'Метаданные файла и DOWNLOAD_URL. Вложения чата задачи: im.dialog.messages.get → FILE_ID. ACCESS_DENIED = нет членства в задаче; инструкцию из ошибки передать оператору.',
    diskFileGetSchema.shape, wrap(diskFileGet));

  tool('b24_disk_file_content',
    'Скачивает файл с MCP-сервера (base64 или save_to). Когда DOWNLOAD_URL недоступен снаружи (WAF 403). Крупные файлы — save_to.',
    diskFileContentSchema.shape, wrap(diskFileContent));

  tool('b24_disk_file_upload',
    'Sube un archivo a una carpeta del Disk de Bitrix24.',
    diskFileUploadSchema.shape, wrap(diskFileUpload));

  // ── Calendario ────────────────────────────────────────────────────────────
  tool('b24_calendar_list',
    'Lista eventos de calendario personal, de grupo o de empresa con filtro de fechas.',
    calendarListSchema.shape, wrap(calendarList));

  tool('b24_calendar_create',
    'Crea un evento en el calendario con participantes, ubicación y recordatorios.',
    calendarCreateSchema.shape, wrap(calendarCreate));

  // ── Feed y Comunicación ─────────────────────────────────────────────────────
  tool('b24_feed_post',
    'Publica un mensaje en el feed de actividad (Live Feed) de Bitrix24, con soporte BB-code.',
    feedPostSchema.shape, wrap(feedPost));

  tool('b24_notify_send',
    'Envía una notificación personal a un usuario dentro de Bitrix24.',
    notifySendSchema.shape, wrap(notifySend));

  tool('b24_chat_send',
    'Envía un mensaje a un chat privado o grupal en el IM de Bitrix24.',
    chatSendSchema.shape, wrap(chatSend));

  // ── Grupos ──────────────────────────────────────────────────────────────────
  tool('b24_groups_list',
    'Lista grupos de trabajo (workgroups y proyectos) con filtros por estado y visibilidad.',
    groupsListSchema.shape, wrap(groupsList));

  // ── Procesos de Negocio ─────────────────────────────────────────────────────
  tool('b24_bizproc_list',
    'Lista instancias de procesos de negocio activas, filtradas por entidad o registro.',
    bizprocListSchema.shape, wrap(bizprocList));

  tool('b24_bizproc_start',
    'Inicia un proceso de negocio (workflow) sobre un documento o registro CRM.',
    bizprocStartSchema.shape, wrap(bizprocStart));

  // ── Telefonía ───────────────────────────────────────────────────────────────
  tool('b24_telephony_calls',
    'Lista el historial de llamadas con filtros por entidad CRM, usuario, duración y fecha.',
    telephonyCallsSchema.shape, wrap(telephonyCalls));

  // ── Catálogo / Productos ────────────────────────────────────────────────────
  tool('b24_products_list',
    'Lista productos del catálogo con filtros por sección, precio, estado activo, etc.',
    productsListSchema.shape, wrap(productsList));

  tool('b24_products_get',
    'Obtiene el detalle completo de un producto por ID.',
    productsGetSchema.shape, wrap(productsGet));

  tool('b24_products_create',
    'Crea un nuevo producto en el catálogo.',
    productsCreateSchema.shape, wrap(productsCreate));

  tool('b24_products_update',
    'Actualiza un producto del catálogo.',
    productsUpdateSchema.shape, wrap(productsUpdate));

  tool('b24_products_sections',
    'Lista las secciones/categorías del catálogo de productos.',
    productsSectionsSchema.shape, wrap(productsSections));

  return server;
}
