// Юнит-тесты read-only гарда. Запуск: node test/readonly.test.mjs
// Без сети — проверяется только логика assertReadOnly / isReadMethod / isReadOnly.

import assert from 'node:assert/strict';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    ${e.message}\n`); }
}

// Гард читает process.env.B24_READONLY на каждый вызов — модуль импортируем один раз.
const { assertReadOnly, isReadMethod, isReadOnly } = await import('../src/bitrix24/readonly.js');

// Для проверки личного вебхука нужен портал по умолчанию.
process.env.B24_DEFAULT_WEBHOOK = 'https://resultforyou.ru/rest/1204351/sharedtoken/';
const { resolveTarget } = await import('../src/utils/resolve-webhook.js');
const { requestContext } = await import('../src/utils/request-context.js');
const withHeaders = (headers, fn) => requestContext.run({ headers }, fn);

const allowed = (m, p) => assert.doesNotThrow(() => assertReadOnly(m, p), `должен пройти: ${m}`);
const blocked = (m, p) => assert.throws(() => assertReadOnly(m, p), `должен блокироваться: ${m}`);

// ── FAIL-SAFE: read-only по умолчанию ──────────────────────────────────────────
console.log('\nFail-safe default:');
test('не задан → read-only', () => { delete process.env.B24_READONLY; assert.equal(isReadOnly(), true); });
test('пусто → read-only', () => { process.env.B24_READONLY = ''; assert.equal(isReadOnly(), true); });
test('true → read-only', () => { process.env.B24_READONLY = 'true'; assert.equal(isReadOnly(), true); });
test('false → запись', () => { process.env.B24_READONLY = 'false'; assert.equal(isReadOnly(), false); });
test('0/no/off → запись', () => {
  for (const v of ['0', 'no', 'off', 'OFF']) { process.env.B24_READONLY = v; assert.equal(isReadOnly(), false, v); }
});

// Дальше — режим read-only включён.
process.env.B24_READONLY = 'true';

// ── Чтение проходит ─────────────────────────────────────────────────────────────
console.log('\nReads разрешены:');
for (const m of [
  'crm.deal.list', 'crm.deal.get', 'crm.deal.fields', 'tasks.task.list', 'tasks.task.get',
  'profile', 'app.info', 'disk.folder.getchildren', 'disk.storage.getforapp',
  'department.get', 'sonet_group.get', 'user.get', 'calendar.event.get',
  'catalog.product.list', 'bizproc.workflow.instances', 'voximplant.statistic.get',
  'crm.lead.status.list',
]) test(m, () => allowed(m));

// ── Запись блокируется (включая методы НЕ из старого чёрного списка) ─────────────
console.log('\nWrites блокируются:');
for (const m of [
  'tasks.task.add', 'tasks.task.update', 'tasks.task.complete',
  'tasks.task.delegate',            // H1: переназначение — НЕ было в чёрном списке
  'crm.deal.add', 'crm.deal.update', 'crm.deal.delete',
  'disk.folder.deletetree',         // H1: рекурсивное удаление — НЕ было в списке
  'im.chat.deleteuser',             // H1
  'log.blogpost.add', 'bizproc.workflow.start', 'user.add',
]) test(m, () => blocked(m));

// ── Evasion блокируется (нормализация) ─────────────────────────────────────────
console.log('\nEvasion блокируется:');
test('верхний регистр CRM.DEAL.ADD', () => blocked('CRM.DEAL.ADD'));
test('суффикс .json', () => blocked('crm.deal.add.json'));
test('хвостовая точка', () => blocked('crm.deal.add.'));
test('query-string', () => blocked('crm.deal.add?id=1'));
test('read с .json проходит', () => allowed('crm.deal.list.json'));

// ── Batch ───────────────────────────────────────────────────────────────────────
console.log('\nBatch:');
test('batch только из reads — проходит', () => allowed('batch', { cmd: {
  a: 'crm.deal.list?filter[>ID]=0', b: 'tasks.task.get?taskId=1',
} }));
test('batch с внутренним write — блок', () => blocked('batch', { cmd: {
  a: 'crm.deal.list', b: 'crm.deal.add?fields[TITLE]=x',
} }));
test('batch с tasks.task.delegate — блок', () => blocked('batch', { cmd: {
  a: 'tasks.task.delegate?taskId=1',
} }));
test('вложенный batch — блок', () => blocked('batch', { cmd: {
  a: 'batch?cmd[x]=crm.deal.add',
} }));

// ── Запись разрешена при B24_READONLY=false ────────────────────────────────────
console.log('\nЗапись при B24_READONLY=false:');
test('write проходит когда не read-only', () => {
  process.env.B24_READONLY = 'false';
  assert.doesNotThrow(() => assertReadOnly('crm.deal.add', {}));
  process.env.B24_READONLY = 'true';
});

// ── Per-call флаг readOnly (личный вебхук переопределяет глобальный режим) ──────
console.log('\nPer-call флаг readOnly:');
// глобально read-only, но явный readOnly=false (личный вебхук) → запись разрешена
test('readOnly=false разрешает запись несмотря на глобальный read-only', () =>
  assert.doesNotThrow(() => assertReadOnly('crm.deal.add', {}, false)));
test('readOnly=true блокирует запись', () =>
  assert.throws(() => assertReadOnly('crm.deal.add', {}, true)));
test('readOnly=false разрешает запись в batch', () =>
  assert.doesNotThrow(() => assertReadOnly('batch', { cmd: { a: 'crm.deal.add?x=1' } }, false)));

// ── Валидация личного вебхука (resolveTarget) ──────────────────────────────────
console.log('\nЛичный вебхук (resolveTarget):');
test('валидный личный вебхук того же портала → readOnly=false', () => {
  const t = resolveTarget({ personal_webhook: 'https://resultforyou.ru/rest/871947/mytoken/' });
  assert.equal(t.readOnly, false);
  assert.equal(t.url, 'https://resultforyou.ru/rest/871947/mytoken/');
});
test('без личного вебхука → readOnly по глобальному правилу', () => {
  process.env.B24_READONLY = 'true';
  assert.equal(resolveTarget({}).readOnly, true);
});
test('чужой хост → ошибка (SSRF)', () =>
  assert.throws(() => resolveTarget({ personal_webhook: 'https://evil.example.com/rest/1/tok/' }), /портал/));
test('http (не https) → ошибка', () =>
  assert.throws(() => resolveTarget({ personal_webhook: 'http://resultforyou.ru/rest/1/tok/' }), /https/));
test('неверный формат пути → ошибка', () =>
  assert.throws(() => resolveTarget({ personal_webhook: 'https://resultforyou.ru/not-a-webhook' }), /формат/));
test('в read-only webhook_url override игнорируется (общий портал)', () => {
  process.env.B24_READONLY = 'true';
  const t = resolveTarget({ webhook_url: 'https://resultforyou.ru/rest/999/other/' });
  assert.equal(t.url, process.env.B24_DEFAULT_WEBHOOK);
  assert.equal(t.readOnly, true);
});

// ── Личный вебхук через заголовок X-B24-Webhook ─────────────────────────────────
console.log('\nЛичный вебхук через заголовок:');
test('заголовок X-B24-Webhook → запись разрешена', () => withHeaders(
  { 'x-b24-webhook': 'https://resultforyou.ru/rest/871947/htok/' },
  () => {
    const t = resolveTarget({});
    assert.equal(t.readOnly, false);
    assert.equal(t.url, 'https://resultforyou.ru/rest/871947/htok/');
  }));
test('параметр personal_webhook имеет приоритет над заголовком', () => withHeaders(
  { 'x-b24-webhook': 'https://resultforyou.ru/rest/871947/htok/' },
  () => {
    const t = resolveTarget({ personal_webhook: 'https://resultforyou.ru/rest/555/ptok/' });
    assert.equal(t.url, 'https://resultforyou.ru/rest/555/ptok/');
  }));
test('заголовок чужого портала → ошибка (SSRF)', () => withHeaders(
  { 'x-b24-webhook': 'https://evil.example.com/rest/1/t/' },
  () => assert.throws(() => resolveTarget({}), /портал/)));
test('без заголовка и без параметра → общий read-only', () => withHeaders(
  {},
  () => { process.env.B24_READONLY = 'true'; assert.equal(resolveTarget({}).readOnly, true); }));

console.log(`\n${failed ? '✗' : '✓'} Итого: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
