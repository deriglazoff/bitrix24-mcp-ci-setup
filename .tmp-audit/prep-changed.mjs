import fs from 'fs';

const dir = 'c:/repos/bitrix24-mcp-ci-setup/.tmp-audit';
const files = [
  '489660f9-38d1-41d8-b417-cb657c016ff2.txt',
  'ea8b0ea7-1447-4b99-9aa8-68014e3089be.txt',
  '9ae88bec-7cd8-4c78-92f1-e130892a09de.txt',
  '1736a41c-c653-4681-877c-30cb0f202ebe.txt',
  '5f3d3994-b46d-40ac-8114-87a770a92e89.txt',
  '84c4fda2-6711-4487-a3ad-63f09deb625c.txt',
  '300f7fb7-6c2d-41f3-b680-9a7ec36c6cb0.txt',
  '8e00932f-989e-4162-9106-258f9c71db90.txt',
].map((f) => 'C:/Users/Level Rush PC/.cursor/projects/c-repos-bitrix24-mcp-ci-setup/agent-tools/' + f);

const tasks = [];
const seen = new Set();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const t of j.tasks || []) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    tasks.push({
      id: String(t.id),
      title: t.title,
      deadline: t.deadline || null,
      createdDate: t.createdDate,
      changedDate: t.changedDate,
      responsible: t.responsible?.name || t.responsibleId,
    });
  }
}

fs.writeFileSync(dir + '/changed-meta.json', JSON.stringify(tasks, null, 2));
const ids = tasks.map((t) => t.id);
fs.writeFileSync(dir + '/changed-ids.json', JSON.stringify(ids));

const batchSize = 40;
const batches = [];
for (let i = 0; i < ids.length; i += batchSize) {
  const chunk = ids.slice(i, i + batchSize);
  const calls = {};
  for (const id of chunk) {
    calls['h' + id] = {
      method: 'tasks.task.history.list',
      params: { taskId: Number(id) },
    };
  }
  batches.push(calls);
}
fs.writeFileSync(dir + '/history-batches.json', JSON.stringify(batches));
console.log(JSON.stringify({ total: tasks.length, batches: batches.length, batch0size: Object.keys(batches[0]).length }, null, 2));
