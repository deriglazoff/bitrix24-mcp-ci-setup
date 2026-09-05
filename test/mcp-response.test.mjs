// Юнит-тесты сжатия MCP-ответов, default select и daily-профиля. Без сети.
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    ${e.message}\n`); }
}

const { stringifyMcpResult, truncateResult, MAX_RESPONSE_CHARS } = await import('../src/utils/mcp-response.js');
const {
  defaultCrmSelect, resolveSelect, extractItems, slicePage, listPayload,
} = await import('../src/utils/pagination.js');
const { isDailyProfile, shouldRegisterTool, ADMIN_TOOL_NAMES } = await import('../src/register-tools.js');

console.log('\nCompact JSON:');
test('без отступов и переносов', () => {
  const s = stringifyMcpResult({ a: 1, b: [2, 3] });
  assert.equal(s, '{"a":1,"b":[2,3]}');
  assert.equal(s.includes('\n'), false);
});
test('короткий объект не трогает truncation', () => {
  const s = stringifyMcpResult({ items: [1, 2] });
  assert.equal(s.includes('"truncated"'), false);
});

console.log('\nTruncation:');
test('длинный items режется и ставит truncated', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ id: i, blob: 'x'.repeat(200) }));
  const out = truncateResult({ portal: 'p', items }, 8_000);
  assert.equal(out.truncated, true);
  assert.ok(out.items.length < 200);
  assert.ok(out.returned === out.items.length);
  assert.ok(out.total === 200);
  assert.ok(JSON.stringify(out).length <= 8_000);
});
test('stringifyMcpResult укладывается в maxChars', () => {
  const items = Array.from({ length: 80 }, (_, i) => ({ id: i, title: 'deal '.repeat(40) }));
  const s = stringifyMcpResult({ items }, 4_000);
  assert.ok(s.length <= 4_000);
  const parsed = JSON.parse(s);
  assert.equal(parsed.truncated, true);
});
test('вложенный result (b24_call) тоже режется', () => {
  const result = Array.from({ length: 100 }, (_, i) => ({ ID: i, TITLE: 'n'.repeat(80) }));
  const out = truncateResult({ method: 'crm.deal.list', result }, 3_000);
  assert.equal(out.truncated, true);
  assert.ok(Array.isArray(out.result) && out.result.length < 100);
});

console.log('\ndefaultCrmSelect / resolveSelect:');
test('deal → TITLE/STAGE', () => {
  assert.deepEqual(defaultCrmSelect('deal'), ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'DATE_MODIFY']);
});
test('contact → NAME/PHONE', () => {
  assert.deepEqual(defaultCrmSelect('contact'), ['ID', 'NAME', 'LAST_NAME', 'PHONE', 'EMAIL']);
});
test('SPA entityTypeId → ID/TITLE/STAGE', () => {
  assert.deepEqual(defaultCrmSelect(undefined, 128), ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID']);
});
test('select ["*"] не подменяется дефолтом', () => {
  assert.equal(resolveSelect(['*'], defaultCrmSelect('deal')), undefined);
});
test('явный select сохраняется', () => {
  assert.deepEqual(resolveSelect(['ID', 'TITLE'], defaultCrmSelect('deal')), ['ID', 'TITLE']);
});
test('пустой select → fallback', () => {
  assert.deepEqual(resolveSelect(undefined, ['ID']), ['ID']);
  assert.deepEqual(resolveSelect([], ['ID']), ['ID']);
});

console.log('\nextractItems / slicePage:');
test('массив как есть', () => assert.deepEqual(extractItems([1, 2]), [1, 2]));
test('result.items', () => assert.deepEqual(extractItems({ items: [{ ID: 1 }] }), [{ ID: 1 }]));
test('result.tasks', () => assert.deepEqual(extractItems({ tasks: [{ id: 2 }] }), [{ id: 2 }]));
test('единственный массив в объекте', () =>
  assert.deepEqual(extractItems({ catalogs: [{ ID: 9 }] }), [{ ID: 9 }]));
test('slicePage режет и ставит next_start', () => {
  const page = slicePage(Array.from({ length: 50 }, (_, i) => i), { limit: 20, start: 0, total: 80 });
  assert.equal(page.count, 20);
  assert.equal(page.truncated, true);
  assert.equal(page.next_start, 20);
  assert.equal(page.total, 80);
});
test('listPayload кладёт ключ массива', () => {
  const page = slicePage([1, 2, 3], { limit: 2, start: 0, total: 3 });
  const payload = listPayload('users', page, { portal: 'x' });
  assert.deepEqual(payload.users, [1, 2]);
  assert.equal(payload.portal, 'x');
  assert.equal(payload.truncated, true);
});

console.log('\nB24_MCP_PROFILE:');
const prev = process.env.B24_MCP_PROFILE;
const restore = () => {
  if (prev === undefined) delete process.env.B24_MCP_PROFILE;
  else process.env.B24_MCP_PROFILE = prev;
};
test('по умолчанию daily', () => {
  delete process.env.B24_MCP_PROFILE;
  assert.equal(isDailyProfile(), true);
  assert.equal(shouldRegisterTool('b24_crm_list'), true);
  assert.equal(shouldRegisterTool('b24_apply_config'), false);
});
test('пусто → daily', () => {
  process.env.B24_MCP_PROFILE = '';
  assert.equal(isDailyProfile(), true);
});
test('daily → скрывает 4 admin-tools', () => {
  process.env.B24_MCP_PROFILE = 'daily';
  for (const name of ADMIN_TOOL_NAMES) assert.equal(shouldRegisterTool(name), false, name);
  assert.equal(ADMIN_TOOL_NAMES.length, 4);
});
test('full → все tools', () => {
  process.env.B24_MCP_PROFILE = 'full';
  assert.equal(isDailyProfile(), false);
  for (const name of ADMIN_TOOL_NAMES) assert.equal(shouldRegisterTool(name), true, name);
});
test('FULL (регистр) → full', () => {
  process.env.B24_MCP_PROFILE = 'FULL';
  assert.equal(isDailyProfile(), false);
});
restore();

void MAX_RESPONSE_CHARS;

console.log(`\n${failed ? '✗' : '✓'} Итого: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
