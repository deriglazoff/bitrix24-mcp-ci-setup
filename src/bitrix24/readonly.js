// Read-only guard для Bitrix24 MCP.
//
// Принцип: ALLOWLIST (deny-by-default). Разрешаются только методы, заведомо
// являющиеся чтением; всё остальное (включая методы, спрятанные внутри batch)
// блокируется. Это надёжнее чёрного списка глаголов: новый/нестандартный
// мутирующий метод не «протекает» только потому, что его нет в списке.
//
// Назначение: безопасный режим для публичного/RAG/агента поддержки — только чтение.
//
// FAIL-SAFE: режим read-only включён ПО УМОЛЧАНИЮ. Запись возможна только при
// явном B24_READONLY=false (или 0/no/off). Любая забытая/кривая конфигурация
// деплоя оставляет сервер в безопасном (только чтение) состоянии.

// Последние сегменты методов, гарантированно являющихся чтением.
const READ_VERBS = new Set([
  'get', 'list', 'fields', 'search', 'counters', 'stat',
  'available', 'isavailable', 'gettypes', 'getfields',
  'getlist', 'getchildren', 'getforapp', 'getbyid', 'getbyids',
]);

// Нерегулярные read-методы, не подпадающие под шаблон get*/list/fields.
const READ_METHODS = new Set([
  'profile',
  'app.info',
  'server.time',
  'scope',
  'methods',
  'method.get',
  'user.current',
  'bizproc.workflow.instances',
]);

// FAIL-SAFE: read-only по умолчанию; запись только при явном отключении.
export function isReadOnly() {
  return !/^(0|false|no|off)$/i.test(String(process.env.B24_READONLY ?? '').trim());
}

// Нормализация имени метода (закрывает evasion: регистр, ?query, хвостовой
// .json, хвостовые точки). Возвращает канонический нижний регистр без хвостов.
function normalizeMethod(method) {
  let m = String(method ?? '').trim().toLowerCase();
  m = m.split('?')[0];        // отрезать query-string
  m = m.replace(/\.json$/, ''); // отрезать хвостовой .json
  m = m.replace(/\.+$/, '');    // отрезать хвостовые точки
  return m;
}

// Метод считается чтением, если он в явном allowlist, либо его последний
// сегмент — read-глагол, либо начинается на get/is/has (getXxx, isXxx, hasXxx).
export function isReadMethod(method) {
  const m = normalizeMethod(method);
  if (!m) return false;
  if (READ_METHODS.has(m)) return true;
  const last = m.split('.').filter(Boolean).pop() || '';
  return READ_VERBS.has(last) || /^(get|is|has)[a-z0-9]*$/.test(last);
}

// бросает ошибку, если в read-only режиме вызывают НЕ-read метод; разбирает batch.
// readOnly — явный флаг вызова (per-client). Если не передан — берётся глобальный
// isReadOnly(). Личный write-вебхук создаёт клиент с readOnly=false → запись разрешена.
export function assertReadOnly(method, params = {}, readOnly = undefined) {
  const ro = readOnly === undefined ? isReadOnly() : readOnly;
  if (!ro) return;

  const m = normalizeMethod(method);

  if (m === 'batch') {
    const cmd = (params && params.cmd) || {};
    for (const [alias, expr] of Object.entries(cmd)) {
      const inner = normalizeMethod(String(expr).split('?')[0]);
      if (inner === 'batch') {
        throw new Error(
          `B24_READONLY: вложенный batch запрещён (alias "${alias}") — MCP в режиме только чтения.`
        );
      }
      if (!isReadMethod(inner)) {
        throw new Error(
          `B24_READONLY: метод записи "${inner}" внутри batch (alias "${alias}") заблокирован — MCP в режиме только чтения.`
        );
      }
    }
    return;
  }

  if (!isReadMethod(m)) {
    throw new Error(
      `B24_READONLY: метод "${method}" заблокирован — MCP в режиме только чтения (разрешены только get/list/fields/search).`
    );
  }
}
