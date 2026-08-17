// Проверки Windows-запускалки на шве процесса. Запуск: node test/launcher.test.mjs
// На не-Windows сразу выходит 0. Реальный Bitrix24 не поднимается.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  process.stdout.write('skip: Windows-only launcher tests\n');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.join(root, 'Bitrix24-MCP.exe');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; process.stdout.write(`  ✓ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ✗ ${name}\n    ${e.message}\n`); }
}

test('в корне лежит Windows PE .exe', () => {
  assert.equal(existsSync(exe), true, 'Bitrix24-MCP.exe отсутствует — соберите scripts/build-launcher.ps1');
  const bytes = readFileSync(exe);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'MZ');
});

test('нет Node.js в PATH → ошибка про Node.js', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'b24-launch-'));
  copyFileSync(exe, path.join(dir, 'Bitrix24-MCP.exe'));
  const r = spawnSync(path.join(dir, 'Bitrix24-MCP.exe'), [], {
    encoding: 'utf8',
    env: { ...process.env, PATH: 'C:\\Windows\\System32', PATHEXT: '.EXE;.CMD;.BAT' },
    timeout: 15000
  });
  assert.notEqual(r.status, 0);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.match(out, /Node\.js/i);
});

test('нет server-http.js → ошибка про корень проекта', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'b24-launch-'));
  copyFileSync(exe, path.join(dir, 'Bitrix24-MCP.exe'));
  const r = spawnSync(path.join(dir, 'Bitrix24-MCP.exe'), [], {
    encoding: 'utf8',
    timeout: 15000
  });
  assert.notEqual(r.status, 0);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.match(out, /server-http\.js|корень/i);
});

test('.env PORT попадает в дочерний Node и не перетирает уже заданное', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'b24-launch-'));
  copyFileSync(exe, path.join(dir, 'Bitrix24-MCP.exe'));
  mkdirSync(path.join(dir, 'node_modules'));
  writeFileSync(path.join(dir, '.env'), 'PORT=51234\nKEEP_ME=from-file\n');
  writeFileSync(path.join(dir, 'server-http.js'),
    'process.stdout.write(`PORT=${process.env.PORT};KEEP_ME=${process.env.KEEP_ME}`)\n');
  const r = spawnSync(path.join(dir, 'Bitrix24-MCP.exe'), [], {
    encoding: 'utf8',
    env: { ...process.env, KEEP_ME: 'from-system' },
    timeout: 15000
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  assert.match(out, /PORT=51234/);
  assert.match(out, /KEEP_ME=from-system/);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
