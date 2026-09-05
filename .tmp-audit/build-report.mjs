import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.tmp-audit/task-401098';
const root = JSON.parse(readFileSync(join(dir, 'root.json'), 'utf8'));
const subtasks = JSON.parse(readFileSync(join(dir, 'subtasks.json'), 'utf8'));
const commentsRaw = JSON.parse(readFileSync(join(dir, 'comments.json'), 'utf8'));

function stripComment(s) {
  return String(s || '')
    .replace(/\[URL=([^\]]+)\][^\[]*\[\/URL\]/gi, '$1')
    .replace(/\[USER=\d+\]([^\[]*)\[\/USER\]/gi, '$1')
    .replace(/\[FILE ID=\d+\]/gi, '[файл]')
    .replace(/\[DISK FILE ID=\d+\]/gi, '[файл]')
    .replace(/\[\/?[A-Z0-9=_\s]+\]/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const comments = {};
for (const [tid, list] of Object.entries(commentsRaw)) {
  if (!Array.isArray(list)) {
    comments[tid] = list;
    continue;
  }
  comments[tid] = list.map((c) => ({
    id: c.ID,
    date: c.POST_DATE,
    author: c.AUTHOR_NAME,
    authorId: c.AUTHOR_ID,
    text: stripComment(c.POST_MESSAGE),
    files: c.ATTACHED_OBJECTS
      ? Object.values(c.ATTACHED_OBJECTS).map((f) => f.NAME || f.FILE_NAME || f.name || '[файл]')
      : [],
  }));
}
const chats = JSON.parse(readFileSync(join(dir, 'chats.json'), 'utf8'));

const STATUS = { '1': 'новая', '2': 'в работе', '3': 'в работе', '4': 'почти просрочена', '5': 'завершена', '6': 'просрочена' };

function decode(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[B\]/gi, '**')
    .replace(/\[\/B\]/gi, '**')
    .replace(/\[URL=([^\]]+)\][\s\S]*?\[\/URL\]/gi, '$1')
    .replace(/\[LIST\]/gi, '')
    .replace(/\[\/LIST\]/gi, '')
    .replace(/\[\*\]/g, '- ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function when(iso) {
  if (!iso) return '—';
  return String(iso).replace('T', ' ').replace(/\+\d{2}:\d{2}$/, '');
}

function people(task) {
  const r = task.responsible?.name || task.responsibleId;
  const c = task.creator?.name || task.createdBy;
  const aud = Object.values(task.auditorsData || {}).map((u) => u.name).join(', ') || '—';
  const acc = Object.values(task.accomplicesData || {}).map((u) => u.name).join(', ') || '—';
  return { r, c, aud, acc };
}

function taskUrl(id) {
  return `https://resultforyou.ru/company/personal/user/0/tasks/task/view/${id}/`;
}

function commentsBlock(id) {
  const list = comments[id];
  if (!Array.isArray(list) || list.length === 0) return '_Комментариев нет._\n';
  const parts = [`Всего комментариев: ${list.length}.\n`];
  for (const c of list) {
    const files = (c.files && c.files.length) ? `\nВложения: ${c.files.join(', ')}` : '';
    parts.push(`#### ${when(c.date)} — ${c.author}\n\n${decode(c.text) || '_(пусто)_'}${files}\n`);
  }
  return parts.join('\n');
}

function chatBlock(id) {
  const chat = chats[id];
  if (!chat || chat.error) return chat?.error ? `_Чат: ${chat.error}_\n` : '';
  const msgs = (chat.messages || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!msgs.length) return '';
  const users = chat.users || {};
  const parts = [`### Чат задачи (chat ${chat.chatId})\n`, `Сообщений: ${msgs.length}.\n`];
  for (const m of msgs) {
    const name = m.author_id
      ? (users[m.author_id]?.name || users[String(m.author_id)]?.name || `id ${m.author_id}`)
      : 'Система';
    const text = decode(String(m.text || '')
      .replace(/\[USER=\d+\]([^\[]*)\[\/USER\]/g, '$1')
      .replace(/\[TIMESTAMP=\d+ FORMAT=[^\]]+\]/g, ''));
    parts.push(`#### ${when(m.date)} — ${name}\n\n${text || '_(пусто)_'}\n`);
  }
  return parts.join('\n');
}

function meta(task) {
  const p = people(task);
  const tags = Object.values(task.tags || {}).map((x) => x.title).join(', ') || '—';
  const lines = [
    `- ID: [${task.id}](${taskUrl(task.id)})`,
    `- Статус: ${STATUS[String(task.status)] || task.status}`,
    `- Постановщик: ${p.c}`,
    `- Исполнитель: ${p.r}`,
    `- Соисполнители: ${p.acc}`,
    `- Наблюдатели: ${p.aud}`,
    `- Создана: ${when(task.createdDate)}`,
    `- Крайний срок: ${when(task.deadline)}`,
    `- Закрыта: ${when(task.closedDate)}`,
    `- Группа: ${task.group?.name || task.groupId || '—'}`,
    `- Теги: ${tags}`,
  ];
  if (task.parentId && task.parentId !== '0') lines.splice(1, 0, `- Родитель: ${task.parentId}`);
  return lines.join('\n');
}

const out = [];
out.push('# ИИ. Проект. Прогноз просрочки — описания и комментарии');
out.push('');
out.push('Сводка по корневой задаче 401098 и всем подзадачам: карточки, описания, комментарии форума и чат.');
out.push(`Снято с портала resultforyou.ru. Корневая задача: ${taskUrl(401098)}`);
out.push('');
out.push('## Оглавление');
out.push('');
out.push(`- [401098 — ${root.title}](#401098)`);
for (const t of subtasks) {
  out.push(`- [${t.id} — ${t.title}](#${t.id})`);
}
out.push('');
out.push('---');
out.push('');
out.push(`## 401098`);
out.push('');
out.push(`### ${root.title}`);
out.push('');
out.push(meta(root));
out.push('');
out.push('### Описание');
out.push('');
out.push(decode(root.description) || '_Описание пустое._');
out.push('');
out.push('### Комментарии');
out.push('');
out.push(commentsBlock('401098'));
out.push(chatBlock('401098'));

for (const t of subtasks) {
  out.push('---');
  out.push('');
  out.push(`## ${t.id}`);
  out.push('');
  out.push(`### ${t.title}`);
  out.push('');
  out.push(meta(t));
  out.push('');
  out.push('### Описание');
  out.push('');
  out.push(decode(t.description) || '_Описание пустое._');
  out.push('');
  out.push('### Комментарии');
  out.push('');
  out.push(commentsBlock(t.id));
  const chat = chatBlock(t.id);
  if (chat) out.push(chat);
}

const path = join(dir, 'описания-и-комментарии.md');
writeFileSync(path, out.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
console.log(path, 'chars', out.join('\n').length);
