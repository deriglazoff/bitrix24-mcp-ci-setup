import fs from 'fs';

const dir = 'c:/repos/bitrix24-mcp-ci-setup/.tmp-audit';
const pages = [
  'C:/Users/Level Rush PC/.cursor/projects/c-repos-bitrix24-mcp-ci-setup/agent-tools/5f10113f-c177-4cf5-b03e-fcacc0856153.txt',
  'C:/Users/Level Rush PC/.cursor/projects/c-repos-bitrix24-mcp-ci-setup/agent-tools/9b194fd3-bcbb-4934-baa5-f0de7e436882.txt',
  'C:/Users/Level Rush PC/.cursor/projects/c-repos-bitrix24-mcp-ci-setup/agent-tools/084d94af-b99e-44d2-a12f-ce3c53847e85.txt',
].map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));

const tasks = [];
const seen = new Set();
for (const p of pages) {
  for (const t of p.tasks || []) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    tasks.push(t);
  }
}

function strip(s) {
  return String(s || '')
    .replace(/\[\/?\w[^\]]*\]/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validate(t) {
  const text = strip(t.description).toLowerCase();
  const issues = [];
  if (!text.includes('цель')) issues.push('нет «Цель»');
  if (!text.includes('результат')) issues.push('нет «Результат»');
  if (!t.deadline) issues.push('нет крайнего срока');
  return issues;
}

const violations = [];
const ok = [];
for (const t of tasks) {
  const issues = validate(t);
  const row = {
    id: t.id,
    title: t.title,
    deadline: t.deadline || null,
    createdDate: t.createdDate,
    responsible: t.responsible?.name || t.responsibleId,
    issues,
    descLen: strip(t.description).length,
  };
  if (issues.length) violations.push(row);
  else ok.push(row);
}

fs.writeFileSync(dir + '/created-all.json', JSON.stringify(tasks));
fs.writeFileSync(dir + '/created-violations.json', JSON.stringify(violations, null, 2));
fs.writeFileSync(
  dir + '/created-summary.json',
  JSON.stringify(
    {
      total: tasks.length,
      ok: ok.length,
      violations: violations.length,
      byIssue: {
        noGoal: violations.filter((v) => v.issues.includes('нет «Цель»')).length,
        noResult: violations.filter((v) => v.issues.includes('нет «Результат»')).length,
        noDeadline: violations.filter((v) => v.issues.includes('нет крайнего срока')).length,
      },
    },
    null,
    2,
  ),
);

console.log(JSON.stringify({
  total: tasks.length,
  ok: ok.length,
  violations: violations.length,
}, null, 2));
console.log(violations.slice(0, 8).map((v) => v.id + ' | ' + v.issues.join(', ') + ' | ' + v.title).join('\n'));
