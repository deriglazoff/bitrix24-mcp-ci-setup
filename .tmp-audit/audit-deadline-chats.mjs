#!/usr/bin/env node
/**
 * Re-check deadline-changed tasks via task chat (im.dialog.messages.get).
 * Requires B24_DEFAULT_WEBHOOK in env.
 */
import fs from 'fs';
import path from 'path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WEBHOOK = (process.env.B24_DEFAULT_WEBHOOK || '').replace(/\/?$/, '/');
if (!WEBHOOK || WEBHOOK.includes('your-portal')) {
  console.error('Set B24_DEFAULT_WEBHOOK');
  process.exit(1);
}

const KEYWORDS = ['статус', 'готов', 'в работе', 'ожида', 'блок', 'прогресс', 'сделан', 'остал'];
const finalPath = path.join(dir, 'final-report.json');
const report = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
const deadlineAudit = JSON.parse(fs.readFileSync(path.join(dir, 'deadline-audit.json'), 'utf8'));

// Always re-check the full deadline-changed set (original comment audit list).
const tasks = [
  ...(deadlineAudit.ok || []),
  ...(deadlineAudit.violations || []),
  ...(deadlineAudit.unchecked || []),
];

function dayKey(d) {
  const dt = new Date(d);
  const shifted = new Date(dt.getTime() + 3 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function stripText(s) {
  return String(s || '')
    .replace(/\[\/?[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function msgDate(m) {
  if (m.date == null) return null;
  if (typeof m.date === 'number' || /^\d+$/.test(String(m.date))) {
    const n = Number(m.date);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  return new Date(m.date);
}

function isSystemMsg(m) {
  if (m.system === 'Y' || m.system === true || m.system === 1) return true;
  const author = Number(m.author_id ?? m.AUTHOR_ID ?? 0);
  if (author === 0) return true;
  return false;
}

function findStatus(messages, when) {
  const whenDay = dayKey(when);
  const whenTime = new Date(when).getTime();
  const scored = [];
  for (const m of messages) {
    if (isSystemMsg(m)) continue;
    const raw = m.text ?? m.message ?? m.MESSAGE ?? '';
    if (!String(raw).trim()) continue;
    const text = stripText(raw);
    if (!KEYWORDS.some((k) => text.includes(k))) continue;
    const d = msgDate(m);
    if (!d || Number.isNaN(d.getTime())) continue;
    const cDay = dayKey(d);
    const dayDiff = Math.abs((Date.parse(cDay) - Date.parse(whenDay)) / 86400000);
    scored.push({
      m,
      text,
      dayDiff,
      dist: Math.abs(d.getTime() - whenTime),
      snippet: String(raw).replace(/\s+/g, ' ').slice(0, 180),
    });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.dayDiff - b.dayDiff || a.dist - b.dist);
  return scored[0];
}

async function bitrixBatch(calls) {
  // calls: { alias: { method, params } }
  const cmd = {};
  for (const [alias, { method, params }] of Object.entries(calls)) {
    const qs = new URLSearchParams();
    // Bitrix batch expects method?param=urlencoded JSON-ish; use form encoding via nested keys
    cmd[alias] = `${method}?${encodeBatchParams(params)}`;
  }
  const body = new URLSearchParams();
  body.set('halt', '0');
  for (const [k, v] of Object.entries(cmd)) {
    body.set(`cmd[${k}]`, v);
  }
  const res = await fetch(`${WEBHOOK}batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`batch HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error}: ${json.error_description || ''}`);
  return json.result || json;
}

function encodeBatchParams(params, prefix = '') {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      parts.push(encodeBatchParams(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item != null && typeof item === 'object') {
          parts.push(encodeBatchParams(item, `${key}[${i}]`));
        } else {
          parts.push(`${key}[${i}]=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (v !== undefined && v !== null) {
      parts.push(`${key}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 1) CHAT_ID for all tasks ───────────────────────────────────────────────
const chatByTask = {}; // id -> chatId | null
const chatErrors = {};

for (const group of chunk(tasks, 40)) {
  const calls = {};
  for (const t of group) {
    calls[`t${t.id}`] = {
      method: 'tasks.task.get',
      params: { id: t.id, select: ['ID', 'TITLE', 'CHAT_ID'] },
    };
  }
  const batch = await bitrixBatch(calls);
  const result = batch.result || batch;
  const errors = batch.result_error || batch.errors || {};
  for (const t of group) {
    const alias = `t${t.id}`;
    if (errors[alias]) {
      chatErrors[t.id] = String(errors[alias].error_description || errors[alias].error || JSON.stringify(errors[alias]));
      chatByTask[t.id] = null;
      continue;
    }
    const payload = result[alias];
    const task = payload?.task || payload?.result?.task || payload;
    const chatId = task?.chatId ?? task?.CHAT_ID ?? null;
    chatByTask[t.id] = chatId != null && chatId !== '' && chatId !== '0' ? String(chatId) : null;
  }
  await sleep(400);
}

console.log(JSON.stringify({
  phase: 'chatIds',
  withChat: Object.values(chatByTask).filter(Boolean).length,
  withoutChat: Object.values(chatByTask).filter((v) => !v).length,
}));

// ── 2) Messages for chats ──────────────────────────────────────────────────
const messagesByChat = {}; // chatId -> messages[]
const msgErrors = {};
const uniqueChats = [...new Set(Object.values(chatByTask).filter(Boolean))];

for (const group of chunk(uniqueChats, 40)) {
  const calls = {};
  for (const chatId of group) {
    calls[`m${chatId}`] = {
      method: 'im.dialog.messages.get',
      params: { DIALOG_ID: `chat${chatId}`, LIMIT: 50 },
    };
  }
  const batch = await bitrixBatch(calls);
  const result = batch.result || batch;
  const errors = batch.result_error || batch.errors || {};
  for (const chatId of group) {
    const alias = `m${chatId}`;
    if (errors[alias]) {
      msgErrors[chatId] = String(errors[alias].error_description || errors[alias].error || JSON.stringify(errors[alias]));
      messagesByChat[chatId] = [];
      continue;
    }
    const payload = result[alias];
    // shape: { messages: [...], users: ..., files: ... } or array
    let msgs = [];
    if (Array.isArray(payload)) msgs = payload;
    else if (Array.isArray(payload?.messages)) msgs = payload.messages;
    else if (Array.isArray(payload?.result?.messages)) msgs = payload.result.messages;
    else if (payload?.result && Array.isArray(payload.result)) msgs = payload.result;
    messagesByChat[chatId] = msgs;
  }
  await sleep(400);
}

console.log(JSON.stringify({
  phase: 'messages',
  chats: uniqueChats.length,
  msgErrors: Object.keys(msgErrors).length,
  avgMsgs: uniqueChats.length
    ? Math.round(uniqueChats.reduce((s, c) => s + (messagesByChat[c]?.length || 0), 0) / uniqueChats.length)
    : 0,
}));

// ── 3) Classify ────────────────────────────────────────────────────────────
const ok = [];
const violations = [];
const unchecked = [];

for (const t of tasks) {
  const base = {
    id: t.id,
    title: t.title,
    from: t.from,
    to: t.to,
    when: t.when,
    responsible: t.responsible,
  };
  const chatId = chatByTask[t.id];
  if (chatErrors[t.id]) {
    unchecked.push({ ...base, reason: `tasks.task.get failed: ${chatErrors[t.id]}` });
    continue;
  }
  if (!chatId) {
    // no chat → treat as violation (we could inspect, nothing to find)
    violations.push({ ...base, reason: 'no CHAT_ID on task; no status comment near deadline change' });
    continue;
  }
  if (msgErrors[chatId]) {
    unchecked.push({ ...base, reason: `im.dialog.messages.get failed: ${msgErrors[chatId]}` });
    continue;
  }
  const msgs = messagesByChat[chatId] || [];
  const hit = findStatus(msgs, t.when);
  if (hit && hit.dayDiff <= 1) {
    ok.push({
      ...base,
      chatId,
      evidence: hit.snippet,
    });
  } else {
    let reason = 'no valid status comment near deadline change';
    if (!msgs.length) reason = 'chat returned no messages';
    else if (hit) reason = `keyword match exists but outside ±1 day window (dayDiff=${hit.dayDiff})`;
    violations.push({ ...base, reason });
  }
}

const audit = {
  checked: ok.length + violations.length + unchecked.length,
  ok,
  violations,
  unchecked,
};

fs.writeFileSync(path.join(dir, 'deadline-chat-audit.json'), JSON.stringify(audit, null, 2));

// ── 4) Merge into final-report.json ────────────────────────────────────────
// previous clear violations stay violations unless chat proves OK
// previous unchecked reclassified based on chat
report.changed.ok = ok;
report.changed.violations = violations;
report.changed.unchecked = unchecked;
report.changed.okCount = ok.length;
report.changed.violationsCount = violations.length;
report.changed.uncheckedCount = unchecked.length;
// keep total / deadlineChanged
fs.writeFileSync(finalPath, JSON.stringify(report, null, 2));

// ── 5) Refresh REPORT.md changed sections ──────────────────────────────────
const mdPath = path.join(dir, 'REPORT.md');
let md = fs.readFileSync(mdPath, 'utf8');

md = md.replace(
  /\| Из них смена DEADLINE \| 63 \| \d+ \| \d+ \| \d+ \|/,
  `| Из них смена DEADLINE | 63 | ${ok.length} | ${violations.length} | ${unchecked.length} |`
);

function listBlock(title, items, formatter) {
  const lines = [`## ${title} (${items.length})`, ''];
  if (!items.length) {
    lines.push('_нет_');
  } else {
    for (const it of items) lines.push(formatter(it));
  }
  lines.push('');
  return lines.join('\n');
}

const okBlock = listBlock(
  'Смена DEADLINE со статус-комментарием в чате',
  ok,
  (it) => `- #${it.id} — ${it.title} — ${it.from} → ${it.to} — ${it.responsible} — ${JSON.stringify(it.evidence)}`
);
const violBlock = listBlock(
  'Смена DEADLINE без статус-комментария',
  violations,
  (it) => `- #${it.id} — ${it.title} — ${it.from} → ${it.to} — ${it.reason}`
);
const unchkBlock = listBlock(
  'Смена DEADLINE — чат не проверен',
  unchecked,
  (it) => `- #${it.id} — ${it.title} — ${it.from} → ${it.to} — ${it.reason}`
);

// Replace from "## Смена DEADLINE" to EOF (changed sections only)
const cut = md.search(/^## Смена DEADLINE/m);
if (cut >= 0) {
  md = md.slice(0, cut) + okBlock + violBlock + unchkBlock;
} else {
  md = md.trimEnd() + '\n\n' + okBlock + violBlock + unchkBlock;
}
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({
  checked: audit.checked,
  ok: ok.length,
  violations: violations.length,
  unchecked: unchecked.length,
  okIds: ok.map((x) => x.id),
}, null, 2));
