'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildContext } = require('../lib/context');

const script = path.join(__dirname, '..', 'scripts', 'roadmap.js');

function project({ tracked = true, roadmap = null, config = '{"version":1}\n' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-rm-')));
  fs.mkdirSync(path.join(dir, '.git'));
  const memDir = path.join(dir, '.project-memory');
  if (tracked) {
    fs.mkdirSync(memDir);
    fs.writeFileSync(path.join(memDir, 'config.json'), config);
    if (roadmap !== null) fs.writeFileSync(path.join(memDir, 'roadmap.md'), roadmap);
  }
  return { dir, memDir, file: path.join(memDir, 'roadmap.md') };
}

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const DISORDERED = '# P — roadmap\n\n## Queue\nq\n\n## Hard constraints\n### Rules for Claude\n- r\n### Technical limits & requirements\n- t\n';

test('tidy reorders and writes; second run is already tidy', () => {
  const { dir, file } = project({ roadmap: DISORDERED });
  const r = run('tidy', dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.split('\n')[0], 'roadmap: reordered');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.indexOf('## Hard constraints') < text.indexOf('## Queue'));
  assert.ok(text.includes('## Open questions'));
  const again = run('tidy', dir);
  assert.strictEqual(again.stdout.split('\n')[0], 'roadmap: already tidy');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), text);
});

test('check never writes', () => {
  const { dir, file } = project({ roadmap: DISORDERED });
  const before = fs.statSync(file).mtimeMs;
  const r = run('check', dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout.split('\n')[0], 'roadmap: needs tidy');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), DISORDERED);
  assert.strictEqual(fs.statSync(file).mtimeMs, before);
  run('tidy', dir);
  assert.strictEqual(run('check', dir).stdout.split('\n')[0], 'roadmap: tidy');
});

test('notes are printed', () => {
  const roadmap = DISORDERED + '\n## Active\n### X\n\n## Appendix\na\n\n## Awaiting verification\n| Item | What to check |\n| --- | --- |\n| A | a |\n';
  const { dir } = project({ roadmap });
  const lines = run('check', dir).stdout.trim().split('\n');
  assert.deepStrictEqual(lines.slice(1), ['active-section', 'extra-sections: Appendix', 'undated-verification-rows: 1']);
});

test('extra sections are joined with a pipe', () => {
  const { dir } = project({ roadmap: DISORDERED + '\n## A, b\nx\n\n## C\ny\n' });
  assert.ok(run('check', dir).stdout.includes('extra-sections: A, b | C\n'));
});

test('kept sections are not reported', () => {
  const { dir } = project({ roadmap: DISORDERED + '\n## Appendix\na\n', config: '{"version":1,"roadmapKeep":["Appendix"]}' });
  assert.ok(!run('check', dir).stdout.includes('extra-sections'));
});

test('untracked and missing roadmap exit 0 with one line', () => {
  const u = project({ tracked: false });
  const ru = run('tidy', u.dir);
  assert.strictEqual(ru.status, 0);
  assert.strictEqual(ru.stdout, "This project isn't tracked by project-memory.\n");
  const m = project();
  const rm = run('tidy', m.dir);
  assert.strictEqual(rm.status, 0);
  assert.strictEqual(rm.stdout, 'roadmap: no roadmap.md\n');
});

test('usage errors exit 1', () => {
  const { dir } = project({ roadmap: DISORDERED });
  assert.strictEqual(run('fix', dir).status, 1);
  assert.strictEqual(run('tidy').status, 1);
});

test('legacy rules still load at session start after tidy', () => {
  const { dir, memDir } = project({ roadmap: '## Queue\nq\n## Working agreements\n- be kind\n' });
  const r = run('tidy', dir);
  assert.ok(r.stdout.includes('legacy-working-agreements'));
  const out = buildContext({ memDir, sessionId: 's', unprocessed: [], deadEndCheck: false });
  assert.ok(out.includes('be kind'), out);
});

test('only roadmap.md changes', () => {
  const { dir, memDir } = project({ roadmap: DISORDERED });
  const before = fs.readdirSync(memDir).sort();
  run('tidy', dir);
  assert.deepStrictEqual(fs.readdirSync(memDir).sort(), before);
});
