'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'hooks', 'session-start.js');
const PROMPT =
  "This project isn't tracked by project-memory. Mention once, briefly, that /project-memory:setup-tracking is available; don't bring it up again.";

function run(input, dataDir, env = {}) {
  return spawnSync(process.execPath, [script], {
    input,
    encoding: 'utf8',
    // CLAUDE_PROJECT_DIR unset by default so the stdin-cwd fallback is exercised.
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, CLAUDE_PROJECT_DIR: '', ...env },
  });
}

function mkDir(name, { git, tracked }) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ss-')), name);
  fs.mkdirSync(dir, { recursive: true });
  if (git) fs.mkdirSync(path.join(dir, '.git'));
  if (tracked) {
    const mem = path.join(dir, '.project-memory');
    fs.mkdirSync(mem);
    fs.writeFileSync(path.join(mem, 'config.json'), '{}');
    fs.writeFileSync(path.join(mem, 'roadmap.md'), '## Hard constraints\n- ship the thing\n');
  }
  return dir;
}

function listAll(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    out.push(p);
    if (e.isDirectory()) out.push(...listAll(p));
  }
  return out.sort();
}

const input = (cwd, source = 'startup') =>
  JSON.stringify({ session_id: 's1', cwd, hook_event_name: 'SessionStart', source });
const data = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pm-data-'));

test('tracked: emits SessionStart additionalContext', () => {
  const dir = mkDir('p', { git: true, tracked: true });
  const r = run(input(dir), data());
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /Project memory is active/);
});

test('compact source returns the same context', () => {
  const dir = mkDir('p', { git: true, tracked: true });
  const a = JSON.parse(run(input(dir, 'startup'), data()).stdout);
  const b = JSON.parse(run(input(dir, 'compact'), data()).stdout);
  assert.strictEqual(b.hookSpecificOutput.additionalContext, a.hookSpecificOutput.additionalContext);
});

test('untracked git repo: prompt text on first run, empty stdout on second run', () => {
  const dir = mkDir('p', { git: true });
  const d = data();
  const first = run(input(dir), d);
  assert.strictEqual(first.status, 0);
  const out = JSON.parse(first.stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.strictEqual(out.hookSpecificOutput.additionalContext, PROMPT);
  const second = run(input(dir), d);
  assert.strictEqual(second.status, 0);
  assert.strictEqual(second.stdout, '');
});

test('untracked non-git dir: empty stdout', () => {
  const dir = mkDir('p', {});
  const r = run(input(dir), data());
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('untracked: repo tree unchanged', () => {
  const dir = mkDir('p', { git: true });
  const before = listAll(dir);
  run(input(dir), data());
  assert.deepStrictEqual(listAll(dir), before);
});

test('empty stdin: exit 0, empty stdout', () => {
  const r = run('', data());
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('CLAUDE_PROJECT_DIR wins over stdin cwd', () => {
  const dir = mkDir('p', { git: true, tracked: true });
  const nested = path.join(dir, 'nested');
  fs.mkdirSync(path.join(nested, '.git'), { recursive: true });
  const r = run(input(nested), data(), { CLAUDE_PROJECT_DIR: dir });
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /Project memory is active/);
  assert.match(out.hookSpecificOutput.additionalContext, /ship the thing/);
});

function withDeadEnd(config) {
  const dir = mkDir('p', { git: true, tracked: true });
  const mem = path.join(dir, '.project-memory');
  if (config === null) fs.rmSync(path.join(mem, 'config.json'));
  else fs.writeFileSync(path.join(mem, 'config.json'), config);
  fs.writeFileSync(path.join(mem, 'history.md'), '## Dead ends\n- tried the cache, failed\n');
  return dir;
}
const ctx = (dir) => {
  const r = run(input(dir), data(), { CLAUDE_PROJECT_DIR: dir });
  assert.strictEqual(r.status, 0);
  return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
};

test('dead-end checker off by default: no Dead ends injected', () => {
  assert.ok(!ctx(withDeadEnd('{"version":1}')).includes('tried the cache'));
});

test('dead-end checker on in config.json: Dead ends injected', () => {
  assert.ok(ctx(withDeadEnd('{"version":1,"deadEndCheck":true}')).includes('tried the cache'));
});

test('invalid config.json: checker treated as off', () => {
  assert.ok(!ctx(withDeadEnd('{not json')).includes('tried the cache'));
  assert.ok(!ctx(withDeadEnd('{"deadEndCheck":"yes"}')).includes('tried the cache'));
});
