import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.tmp-audit/task-401098/comments-readable.json', 'utf8'));
for (const x of c['414594']) {
  if (x.text.length > 200 && !/назначен|добавлен|Задача завершена|просроч/i.test(x.text)) {
    console.log('\n====', x.date, x.author, 'len', x.text.length);
    console.log(x.text);
  }
}
console.log('\n\n==== ROOT first long comment rest');
const root = c['401098'].find(x => x.text.includes('Результаты встречи'));
console.log(root.text.slice(3000));
