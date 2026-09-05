#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const outPath = path.join(dir, 'comments.json');
const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

const file = process.argv[2];
if (!file) {
  console.error('Usage: node merge-comments.mjs <batch.json>');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const result = raw.result ?? raw;
const errors = raw.errors ?? {};
let n = 0;
for (const [alias, payload] of Object.entries(result)) {
  if (!alias.startsWith('c')) continue;
  const id = alias.slice(1);
  if (errors[alias]) {
    existing[id] = { ok: false, reason: String(errors[alias].error_description || errors[alias].error || 'error'), comments: [] };
  } else if (Array.isArray(payload)) {
    existing[id] = {
      ok: true,
      comments: payload.map(c => ({
        id: c.ID ?? c.id,
        date: c.POST_DATE ?? c.postDate,
        message: c.POST_MESSAGE ?? c.postMessage ?? '',
        author: c.AUTHOR_NAME ?? c.authorName ?? '',
        authorId: c.AUTHOR_ID ?? c.authorId ?? ''
      }))
    };
  } else {
    existing[id] = { ok: false, reason: 'unexpected payload shape', comments: [] };
  }
  n++;
}
// also record error-only aliases
if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
  for (const [alias, err] of Object.entries(errors)) {
    if (!alias.startsWith('c')) continue;
    const id = alias.slice(1);
    if (!existing[id]) {
      existing[id] = { ok: false, reason: String(err.error_description || err.error || 'error'), comments: [] };
      n++;
    }
  }
}
fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
console.log(`merged ${n}; total=${Object.keys(existing).length}`);
