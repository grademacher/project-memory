'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'scripts', 'session-log.js');

function project({ tracked = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-slog-')));
  fs.mkdirSync(path.join(dir, '.git'));
  const memDir = path.join(dir, '.project-memory');
  if (tracked) {
    fs.mkdirSync(path.join(memDir, 'state', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(memDir, 'config.json'), '{"version":1}\n');
  }
  return { dir, memDir };
}

function writeLog(memDir, id, events) {
  const file = path.join(memDir, 'state', 'sessions', `${id}.jsonl`);
  fs.writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return file;
}

function run(...args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `session-log failed: ${r.stderr}`);
  return r.stdout;
}

test('show lists prompts, deduped files with counts, commits flagged', () => {
  const { dir, memDir } = project();
  writeLog(memDir, 'cur', [
    { ts: '2026-11-19T09:00:00.000Z', type: 'prompt', text: 'fix the parser' },
    { ts: '2026-11-19T09:01:00.000Z', type: 'tool', tool: 'Edit', files: ['src/a.js'] },
    { ts: '2026-11-19T09:02:00.000Z', type: 'tool', tool: 'Bash', cmd: 'npm test', isCommit: false },
    { ts: '2026-11-19T09:03:00.000Z', type: 'tool', tool: 'Write', files: ['src/a.js'] },
    { ts: '2026-11-19T09:04:00.000Z', type: 'tool', tool: 'Edit', files: ['src/b.js'] },
    { ts: '2026-11-19T09:05:00.000Z', type: 'compact', trigger: 'auto' },
    { ts: '2026-11-19T09:06:00.000Z', type: 'prompt', text: 'now commit\nit please' },
    { ts: '2026-11-19T09:07:00.000Z', type: 'tool', tool: 'Bash', cmd: 'git commit -m "fix parser"', isCommit: true },
  ]);
  const out = run('show', dir, 'cur');
  assert.ok(out.includes(`Memory folder: ${memDir}`), out);
  assert.match(out, /2026-11-19T09:00:00\.000Z/);
  assert.match(out, /1\. fix the parser\n2\. now commit it please/);
  assert.match(out, /src\/a\.js \(2\)/);
  assert.match(out, /src\/b\.js \(1\)/);
  assert.strictEqual(out.match(/src\/a\.js/g).length, 1);
  const testIdx = out.indexOf('npm test');
  const commitIdx = out.indexOf('git commit -m "fix parser"');
  assert.ok(testIdx > -1 && commitIdx > testIdx, 'bash commands in time order');
  assert.match(out, /git commit -m "fix parser"`? \*\*\(commit\)\*\*/);
  assert.doesNotMatch(out, /npm test`? \*\*\(commit\)\*\*/);
  assert.match(out, /2026-11-19T09:05:00\.000Z.*auto/);
  assert.doesNotMatch(out, /Abandoned/i);
});

test('show includes abandoned sessions section', () => {
  const { dir, memDir } = project();
  writeLog(memDir, 'cur', [{ ts: '2026-11-19T09:00:00.000Z', type: 'prompt', text: 'today' }]);
  writeLog(memDir, 'old1', [
    { ts: '2026-11-18T10:00:00.000Z', type: 'prompt', text: 'yesterday work' },
    { ts: '2026-11-18T10:05:00.000Z', type: 'end', reason: 'exit' },
  ]);
  const out = run('show', dir, 'cur');
  const idx = out.search(/Abandoned session old1/i);
  assert.ok(idx > -1, out);
  assert.ok(out.indexOf('yesterday work') > idx);
  assert.ok(out.indexOf('1. today') < idx);
});

test('show with no log prints the no-log line', () => {
  const { dir } = project();
  const out = run('show', dir, 'cur');
  assert.match(out, /No activity log for this session\./);
});

test('show on an untracked project says so', () => {
  const { dir } = project({ tracked: false });
  const out = run('show', dir, 'cur');
  assert.strictEqual(out.trim(), "This project isn't tracked by project-memory.");
});

test('done moves logs to processed', () => {
  const { dir, memDir } = project();
  const cur = writeLog(memDir, 'cur', [{ ts: '2026-11-19T09:00:00.000Z', type: 'prompt', text: 'x' }]);
  const old = writeLog(memDir, 'old1', [{ ts: '2026-11-18T10:00:00.000Z', type: 'end', reason: 'exit' }]);
  run('done', dir, 'cur', 'old1');
  const processed = path.join(memDir, 'state', 'sessions', 'processed');
  assert.strictEqual(fs.existsSync(cur), false);
  assert.strictEqual(fs.existsSync(old), false);
  for (const id of ['cur', 'old1']) {
    const lines = fs.readFileSync(path.join(processed, `${id}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
    assert.strictEqual(lines[lines.length - 1].type, 'wrapped');
  }
});

test('done reports ids with no log separately', () => {
  const { dir, memDir } = project();
  writeLog(memDir, 'cur', [{ ts: '2026-11-19T09:00:00.000Z', type: 'prompt', text: 'x' }]);
  const out = run('done', dir, 'cur', 'ghost');
  assert.match(out, /Marked processed: cur\n/);
  assert.doesNotMatch(out, /Marked processed:.*ghost/);
  assert.match(out, /Marked wrapped \(no activity log\): ghost/);
  assert.doesNotMatch(out, /No log for/);
});

test('show still lists an abandoned log with no parseable events', () => {
  const { dir, memDir } = project();
  writeLog(memDir, 'cur', [{ ts: '2026-11-19T09:00:00.000Z', type: 'prompt', text: 'today' }]);
  const broken = path.join(memDir, 'state', 'sessions', 'old2.jsonl');
  fs.writeFileSync(broken, '{torn line\n');
  const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  fs.utimesSync(broken, old, old);
  const out = run('show', dir, 'cur');
  assert.match(out, /## Abandoned session old2\n\nlog unreadable or empty/, out);
});
