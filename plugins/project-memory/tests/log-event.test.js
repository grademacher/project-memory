'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'hooks', 'log-event.js');

function run(input, env) {
  return spawnSync(process.execPath, [script], {
    input,
    encoding: 'utf8',
    // Unset by default so the stdin-cwd fallback is exercised; tests that need it pass it.
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', ...env },
  });
}

function mkProject(name, tracked) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-hook-'));
  const dir = path.join(base, name);
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  if (tracked) {
    fs.mkdirSync(path.join(dir, '.project-memory'));
    fs.writeFileSync(path.join(dir, '.project-memory', 'config.json'), '{}');
  }
  return { base, dir };
}

function listAll(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out.push(p);
    if (e.isDirectory()) out.push(...listAll(p));
  }
  return out;
}

const prompt = (cwd) =>
  JSON.stringify({ session_id: 'abc-1', cwd, hook_event_name: 'UserPromptSubmit', prompt: 'hi' });

test('tracked project: appends a line to state/sessions/<id>.jsonl', () => {
  const { base, dir } = mkProject('proj', true);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const r = run(prompt(dir), { CLAUDE_PLUGIN_DATA: data });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const f = path.join(dir, '.project-memory', 'state', 'sessions', 'abc-1.jsonl');
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const ev = JSON.parse(lines[0]);
  assert.strictEqual(ev.type, 'prompt');
  assert.strictEqual(ev.text, 'hi');
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

test('untracked project: writes nothing anywhere under the repo', () => {
  const { base, dir } = mkProject('proj', false);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const before = listAll(dir);
  const r = run(prompt(dir), { CLAUDE_PLUGIN_DATA: data });
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(listAll(dir), before);
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

test('empty stdin: exit 0, empty stdout, error recorded in plugin-data errors.log', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const r = run('', { CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: data });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const log = fs.readFileSync(path.join(data, 'errors.log'), 'utf8');
  assert.match(log, /^\d{4}-\d\d-\d\dT/);
  assert.match(log, /Error/);
  fs.rmSync(data, { recursive: true, force: true });
});

test('malformed JSON: exit 0', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const r = run('{not json', { CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: data });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  fs.rmSync(data, { recursive: true, force: true });
});

test('repo path with spaces works', () => {
  const { base, dir } = mkProject('my proj with spaces', true);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const r = run(prompt(dir), { CLAUDE_PLUGIN_DATA: data });
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(dir, '.project-memory', 'state', 'sessions', 'abc-1.jsonl')));
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});

test('CLAUDE_PROJECT_DIR wins over stdin cwd (Claude cd-ed into a nested repo)', () => {
  const { base, dir } = mkProject('proj', true);
  const nested = path.join(dir, 'nested');
  fs.mkdirSync(path.join(nested, '.git'), { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));
  const r = run(prompt(nested), { CLAUDE_PLUGIN_DATA: data, CLAUDE_PROJECT_DIR: dir });
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(dir, '.project-memory', 'state', 'sessions', 'abc-1.jsonl')));
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
});
