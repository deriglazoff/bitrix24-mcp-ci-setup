import { readFileSync, writeFileSync } from 'node:fs';

const comments = JSON.parse(readFileSync('.tmp-audit/task-401098/comments.json', 'utf8'));

function strip(s) {
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

const out = {};
for (const [tid, list] of Object.entries(comments)) {
  if (!Array.isArray(list)) {
    out[tid] = list;
    continue;
  }
  out[tid] = list.map((c) => ({
    id: c.ID,
    date: c.POST_DATE,
    author: c.AUTHOR_NAME,
    authorId: c.AUTHOR_ID,
    text: strip(c.POST_MESSAGE),
    attached: c.ATTACHED_OBJECTS ? Object.keys(c.ATTACHED_OBJECTS).length : 0,
    files: c.ATTACHED_OBJECTS
      ? Object.values(c.ATTACHED_OBJECTS).map((f) => f.NAME || f.FILE_NAME || f.name || JSON.stringify(f).slice(0, 80))
      : [],
  })).filter((c) => c.text);
}

writeFileSync('.tmp-audit/task-401098/comments-readable.json', JSON.stringify(out, null, 2), 'utf8');

for (const [tid, list] of Object.entries(out)) {
  console.log('\n======== TASK', tid, 'comments:', Array.isArray(list) ? list.length : list);
  if (!Array.isArray(list)) continue;
  for (const c of list) {
    console.log(`\n--- ${c.date} | ${c.author} | files:${c.files.join(', ') || '-'}`);
    console.log(c.text.slice(0, 4000));
  }
}
