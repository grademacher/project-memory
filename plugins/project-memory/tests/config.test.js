'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'scripts', 'config.js');

function project({ tracked = true, config = '{"version":1,"deadEndCheck":false}\n' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-cfg-')));
  fs.mkdirSync(path.join(dir, '.git'));
  const memDir = path.join(dir, '.project-memory');
  if (tracked) {
    fs.mkdirSync(memDir);
    fs.writeFileSync(path.join(memDir, 'config.json'), config);
  }
  return { dir, file: path.join(memDir, 'config.json') };
}

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('no argument reports the current state', () => {
  const { dir } = project();
  const r = run(dir, 'dead-ends');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'Dead-end checker: off\n');
  const on = project({ config: '{"version":1,"deadEndCheck":true}' });
  assert.strictEqual(run(on.dir, 'dead-ends').stdout, 'Dead-end checker: on\n');
});

test('missing key reports off', () => {
  const { dir } = project({ config: '{"version":1}' });
  assert.strictEqual(run(dir, 'dead-ends').stdout, 'Dead-end checker: off\n');
});

test('on writes true, keeps other keys, says when it takes effect', () => {
  const { dir, file } = project({ config: '{"version":1,"other":"x"}' });
  const r = run(dir, 'dead-ends', 'on');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Dead-end checker: on/);
  assert.match(r.stdout, /takes effect next session start/);
  assert.deepStrictEqual(readJson(file), { version: 1, other: 'x', deadEndCheck: true });
});

test('off writes false', () => {
  const { dir, file } = project({ config: '{"version":1,"deadEndCheck":true}' });
  const r = run(dir, 'dead-ends', 'OFF');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Dead-end checker: off/);
  assert.deepStrictEqual(readJson(file), { version: 1, deadEndCheck: false });
});

test('unreadable config.json is replaced by a valid one on a change', () => {
  const { dir, file } = project({ config: '{broken' });
  assert.strictEqual(run(dir, 'dead-ends').stdout, 'Dead-end checker: off\n');
  assert.strictEqual(run(dir, 'dead-ends', 'on').status, 0);
  assert.deepStrictEqual(readJson(file), { version: 1, deadEndCheck: true });
});

test('config.json without version gets version 1 on a change', () => {
  const { dir, file } = project({ config: '{"other":"x"}' });
  assert.strictEqual(run(dir, 'dead-ends', 'off').status, 0);
  assert.deepStrictEqual(readJson(file), { version: 1, other: 'x', deadEndCheck: false });
});

test('works from a subfolder of the project', () => {
  const { dir, file } = project();
  const sub = path.join(dir, 'src');
  fs.mkdirSync(sub);
  assert.strictEqual(run(sub, 'dead-ends', 'on').status, 0);
  assert.strictEqual(readJson(file).deadEndCheck, true);
});

test('untracked project: message, exit 0, nothing written', () => {
  const { dir } = project({ tracked: false });
  const r = run(dir, 'dead-ends', 'on');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "This project isn't tracked by project-memory.\n");
  assert.ok(!fs.existsSync(path.join(dir, '.project-memory')));
});

test('bad arguments: usage on stderr, exit 1, nothing written', () => {
  const { dir, file } = project();
  const before = fs.readFileSync(file, 'utf8');
  for (const args of [[dir, 'dead-ends', 'maybe'], [dir, 'other'], []]) {
    const r = run(...args);
    assert.strictEqual(r.status, 1, args.join(' '));
    assert.match(r.stderr, /usage/);
  }
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('roadmap-keep lists none by default', () => {
  const { dir } = project({ config: '{"version":1}' });
  const r = run(dir, 'roadmap-keep');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'Roadmap sections kept: none\n');
});

test('roadmap-keep add stores the name and keeps other keys', () => {
  const { dir, file } = project();
  const r = run(dir, 'roadmap-keep', 'add', '8.', 'Maintenance', 'and', 'tech', 'debt');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'Kept roadmap section: 8. Maintenance and tech debt\n');
  const c = readJson(file);
  assert.deepStrictEqual(c.roadmapKeep, ['8. Maintenance and tech debt']);
  assert.strictEqual(c.deadEndCheck, false);
  assert.strictEqual(c.version, 1);
  run(dir, 'roadmap-keep', 'add', 'Appendix');
  assert.strictEqual(run(dir, 'roadmap-keep').stdout, 'Roadmap sections kept: 8. Maintenance and tech debt | Appendix\n');
});

test('roadmap-keep add is case-insensitive idempotent', () => {
  const { dir, file } = project();
  run(dir, 'roadmap-keep', 'add', 'Appendix');
  const r = run(dir, 'roadmap-keep', 'add', 'appendix');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(readJson(file).roadmapKeep.length, 1);
});

test('roadmap-keep add with no name is a usage error', () => {
  const { dir } = project();
  assert.strictEqual(run(dir, 'roadmap-keep', 'add').status, 1);
  assert.strictEqual(run(dir, 'roadmap-keep', 'bogus').status, 1);
});

test('roadmap-keep on an untracked project prints the untracked line', () => {
  const { dir } = project({ tracked: false });
  const r = run(dir, 'roadmap-keep', 'add', 'X');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "This project isn't tracked by project-memory.\n");
});

test('roadmapKeep ignores non-arrays and non-strings', () => {
  const { roadmapKeep } = require('../lib/config');
  assert.deepStrictEqual(roadmapKeep({}), []);
  assert.deepStrictEqual(roadmapKeep({ roadmapKeep: 'x' }), []);
  assert.deepStrictEqual(roadmapKeep({ roadmapKeep: ['a', 3, '', ' b '] }), ['a', ' b ']);
});
