#!/usr/bin/env node
/**
 * Save a comments API response for one task.
 * Usage: node save-comments.mjs <taskId> <json-file>
 * Or merge: node save-comments.mjs --merge-dir <dir>
 */
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outPath = path.join(dir, 'comments.json');

const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

if (process.argv[2] === '--from-agent-file') {
  const file = process.argv[3];
  const taskId = String(process.argv[4]);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  let list = raw.result ?? raw;
  if (!Array.isArray(list)) list = list?.result ?? [];
  if (!Array.isArray(list)) list = [];
  existing[taskId] = { ok: true, comments: list.map(c => ({
    id: c.ID ?? c.id,
    date: c.POST_DATE ?? c.postDate,
    message: c.POST_MESSAGE ?? c.postMessage ?? '',
    author: c.AUTHOR_NAME ?? c.authorName ?? '',
    authorId: c.AUTHOR_ID ?? c.authorId ?? ''
  }))};
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log(`saved ${taskId}: ${existing[taskId].comments.length} comments; total tasks=${Object.keys(existing).length}`);
  process.exit(0);
}

if (process.argv[2] === '--fail') {
  const taskId = String(process.argv[3]);
  const reason = process.argv[4] || 'comments API failed';
  existing[taskId] = { ok: false, reason, comments: [] };
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log(`failed ${taskId}: ${reason}`);
  process.exit(0);
}

console.log('use --from-agent-file or --fail');
