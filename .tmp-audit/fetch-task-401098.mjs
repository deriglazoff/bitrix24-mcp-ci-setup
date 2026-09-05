import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'task-401098');
mkdirSync(outDir, { recursive: true });

function webhookFromMcp() {
  const mcp = JSON.parse(readFileSync('C:/Users/Level Rush PC/.cursor/mcp.json', 'utf8'));
  const args = mcp.mcpServers['bitrix24-test']?.args || [];
  const header = args.find((a, i) => typeof args[i - 1] === 'string' && args[i - 1] === '--header') || args.find((a) => String(a).startsWith('X-B24-Webhook:'));
  const m = String(header).match(/https:\/\/[^\s"]+/);
  if (!m) throw new Error('webhook not found');
  return m[0].endsWith('/') ? m[0] : m[0] + '/';
}

const webhook = webhookFromMcp();

async function call(method, params = {}) {
  const url = `${webhook}${method}.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (data.error) {
    const err = new Error(`${method}: ${data.error} ${data.error_description || ''}`);
    err.payload = data;
    throw err;
  }
  return data;
}

async function listAll(method, params, key) {
  const items = [];
  let start = 0;
  for (;;) {
    const data = await call(method, { ...params, start });
    const chunk = key ? data.result?.[key] ?? data.result : data.result;
    const arr = Array.isArray(chunk) ? chunk : chunk ? [chunk] : [];
    items.push(...arr);
    if (data.next == null) break;
    start = data.next;
  }
  return items;
}

const TASK_SELECT = [
  'ID', 'TITLE', 'DESCRIPTION', 'STATUS', 'RESPONSIBLE_ID', 'CREATED_BY',
  'CREATED_DATE', 'CHANGED_DATE', 'CLOSED_DATE', 'DEADLINE', 'GROUP_ID',
  'PARENT_ID', 'PRIORITY', 'TAGS', 'UF_CRM_TASK', 'AUDITORS', 'ACCOMPLICES',
  'TIME_ESTIMATE', 'TIME_SPENT_IN_LOGS', 'STATUS_CHANGED_DATE', 'CLOSED_BY',
  'FORUM_ID', 'FORUM_TOPIC_ID',
];

const root = await call('tasks.task.get', { taskId: 401098, select: TASK_SELECT.concat(['*', 'UF_*']) });
const rootTask = root.result?.task ?? root.result;
writeFileSync(join(outDir, 'root.json'), JSON.stringify(rootTask, null, 2), 'utf8');

async function childrenOf(parentId) {
  const tasks = [];
  let start = 0;
  for (;;) {
    const data = await call('tasks.task.list', {
      filter: { PARENT_ID: parentId },
      select: TASK_SELECT,
      order: { ID: 'ASC' },
      start,
    });
    const chunk = data.result?.tasks ?? data.result ?? [];
    tasks.push(...chunk);
    if (data.next == null) break;
    start = data.next;
  }
  return tasks;
}

const all = [];
const queue = [String(rootTask.id ?? rootTask.ID ?? 401098)];
const seen = new Set();
while (queue.length) {
  const id = queue.shift();
  if (seen.has(id)) continue;
  seen.add(id);
  const kids = await childrenOf(id);
  for (const t of kids) {
    all.push(t);
    queue.push(String(t.id ?? t.ID));
  }
}
writeFileSync(join(outDir, 'subtasks.json'), JSON.stringify(all, null, 2), 'utf8');

const ids = [String(rootTask.id ?? 401098), ...all.map((t) => String(t.id ?? t.ID))];

const comments = {};
for (const id of ids) {
  try {
    const list = await listAll('task.commentitem.getlist', { TASKID: Number(id) });
    comments[id] = list;
  } catch (e) {
    comments[id] = { error: e.message };
  }
}
writeFileSync(join(outDir, 'comments.json'), JSON.stringify(comments, null, 2), 'utf8');

const chats = {};
for (const t of [rootTask, ...all]) {
  const id = String(t.id ?? t.ID);
  const chatId = t.chatId ?? t.CHAT_ID;
  if (!chatId || chatId === '0') {
    chats[id] = { chatId: null, messages: [] };
    continue;
  }
  try {
    const data = await call('im.dialog.messages.get', { DIALOG_ID: `chat${chatId}`, LIMIT: 50 });
    let messages = data.result?.messages ?? data.result ?? [];
    const users = data.result?.users ?? {};
    const files = data.result?.files ?? {};
    let oldest = messages.length ? Math.min(...messages.map((m) => Number(m.id))) : null;
    while (oldest && messages.length >= 50) {
      const more = await call('im.dialog.messages.get', {
        DIALOG_ID: `chat${chatId}`,
        LAST_ID: oldest,
        LIMIT: 50,
      });
      const extra = more.result?.messages ?? [];
      if (!extra.length) break;
      messages = messages.concat(extra);
      Object.assign(users, more.result?.users ?? {});
      Object.assign(files, more.result?.files ?? {});
      const idsMsg = extra.map((m) => Number(m.id));
      const nextOldest = Math.min(...idsMsg);
      if (nextOldest === oldest) break;
      oldest = nextOldest;
      if (extra.length < 50) break;
    }
    chats[id] = { chatId, messages, users, files };
  } catch (e) {
    chats[id] = { chatId, error: e.message };
  }
}
writeFileSync(join(outDir, 'chats.json'), JSON.stringify(chats, null, 2), 'utf8');

const userIds = new Set();
function collectUser(id) {
  if (id && id !== '0') userIds.add(String(id));
}
collectUser(rootTask.responsibleId ?? rootTask.RESPONSIBLE_ID);
collectUser(rootTask.createdBy ?? rootTask.CREATED_BY);
for (const t of all) {
  collectUser(t.responsibleId ?? t.RESPONSIBLE_ID);
  collectUser(t.createdBy ?? t.CREATED_BY);
  for (const a of t.accomplices ?? t.ACCOMPLICES ?? []) collectUser(a);
  for (const a of t.auditors ?? t.AUDITORS ?? []) collectUser(a);
}

const users = [];
if (userIds.size) {
  const data = await call('user.get', { FILTER: { ID: [...userIds] } });
  users.push(...(data.result ?? []));
}
writeFileSync(join(outDir, 'users.json'), JSON.stringify(users, null, 2), 'utf8');

const summary = {
  root: {
    id: rootTask.id ?? rootTask.ID,
    title: rootTask.title ?? rootTask.TITLE,
    status: rootTask.status ?? rootTask.STATUS,
    responsibleId: rootTask.responsibleId ?? rootTask.RESPONSIBLE_ID,
    createdBy: rootTask.createdBy ?? rootTask.CREATED_BY,
    deadline: rootTask.deadline ?? rootTask.DEADLINE,
    created: rootTask.createdDate ?? rootTask.CREATED_DATE,
    closed: rootTask.closedDate ?? rootTask.CLOSED_DATE,
    groupId: rootTask.groupId ?? rootTask.GROUP_ID,
    parentId: rootTask.parentId ?? rootTask.PARENT_ID,
    chatId: rootTask.chatId ?? rootTask.CHAT_ID,
    descLen: String(rootTask.description ?? rootTask.DESCRIPTION ?? '').length,
  },
  subtaskCount: all.length,
  subtasks: all.map((t) => ({
    id: t.id ?? t.ID,
    title: t.title ?? t.TITLE,
    status: t.status ?? t.STATUS,
    parentId: t.parentId ?? t.PARENT_ID,
    responsibleId: t.responsibleId ?? t.RESPONSIBLE_ID,
    deadline: t.deadline ?? t.DEADLINE,
    created: t.createdDate ?? t.CREATED_DATE,
    closed: t.closedDate ?? t.CLOSED_DATE,
    descLen: String(t.description ?? t.DESCRIPTION ?? '').length,
    chatId: t.chatId ?? t.CHAT_ID,
  })),
  commentCounts: Object.fromEntries(ids.map((id) => [id, Array.isArray(comments[id]) ? comments[id].length : comments[id]])),
  chatCounts: Object.fromEntries(ids.map((id) => [id, chats[id]?.messages?.length ?? chats[id]?.error ?? 0])),
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
