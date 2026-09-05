#!/usr/bin/env node
/**
 * Process tasks.task.history.list batch results.
 * Usage: node process-history.mjs <history-batch.json>
 * Appends deadline changes into deadline-changes.json
 */
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PERIOD_START = new Date('2026-08-20T00:00:00+03:00');
const outPath = path.join(dir, 'deadline-changes.json');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node process-history.mjs <batch.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
// Accept either { result: { alias: ... } } or direct alias map
const result = raw.result ?? raw.results ?? raw;

function extractList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.result)) return payload.result;
  if (payload.result && Array.isArray(payload.result.list)) return payload.result.list;
  if (payload.result && Array.isArray(payload.result)) return payload.result;
  return [];
}

function isNonEmpty(v) {
  return v != null && String(v).trim() !== '' && String(v).trim() !== 'null';
}

const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
let found = 0;

for (const [alias, payload] of Object.entries(result)) {
  const taskId = alias.replace(/^h/, '');
  const list = extractList(payload);
  const changes = [];
  for (const entry of list) {
    const field = entry.field ?? entry.FIELD ?? entry?.data?.field;
    const createdDate = entry.createdDate ?? entry.CREATED_DATE ?? entry?.data?.createdDate;
    const value = entry.value ?? entry.VALUE ?? entry?.data?.value ?? {};
    const from = value?.from ?? value?.FROM ?? null;
    const to = value?.to ?? value?.TO ?? null;
    if (String(field).toUpperCase() !== 'DEADLINE') continue;
    if (!createdDate) continue;
    const when = new Date(createdDate);
    if (Number.isNaN(when.getTime()) || when < PERIOD_START) continue;
    if (!isNonEmpty(from)) continue; // first set, not a real change
    changes.push({ from, to, when: createdDate });
  }
  if (changes.length) {
    // keep latest change in period
    changes.sort((a, b) => new Date(b.when) - new Date(a.when));
    existing[taskId] = changes[0];
    found++;
  }
}

fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
console.log(`Processed ${Object.keys(result).length} aliases, +${found} deadline changes, total=${Object.keys(existing).length}`);
