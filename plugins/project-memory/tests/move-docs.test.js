'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'scripts', 'move-docs.js');
const initScript = path.join(__dirname, '..', 'scripts', 'init-memory.js');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-move-')));
}

function write(file, text = 'x\n') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// A git repo with one commit (README.md) and an initialised memory folder.
function repo() {
  const dir = path.join(tmp(), 'repo');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  write(path.join(dir, 'README.md'), '# demo\n');
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-q', '-m', 'init');
  initMemory(dir);
  return dir;
}

function initMemory(dir) {
  const r = spawnSync(process.execPath, [initScript, dir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
}

function move(root, plan, env) {
  const planFile = path.join(root, '.project-memory', 'state', 'move-plan.json');
  write(planFile, JSON.stringify(plan));
  const r = spawnSync(process.execPath, [script, root, planFile], {
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  assert.strictEqual(r.status, 0, `move-docs failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const mem = (root, ...p) => path.join(root, '.project-memory', ...p);

test('untracked file moves', () => {
  const root = repo();
  write(path.join(root, 'notes', 'research.md'), 'findings\n');
  const out = move(root, [{ from: 'notes/research.md', to: 'research/2026-11-19-x.md', force: false }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].status, 'moved', JSON.stringify(out));
  assert.strictEqual(out[0].from, 'notes/research.md');
  assert.strictEqual(out[0].to, 'research/2026-11-19-x.md');
  assert.strictEqual(fs.existsSync(path.join(root, 'notes', 'research.md')), false);
  assert.strictEqual(fs.readFileSync(mem(root, 'research', '2026-11-19-x.md'), 'utf8'), 'findings\n');
  assert.strictEqual(git(root, 'status', '--porcelain'), '');
});

test('tracked markdown doc without the tracked flag is skipped and git status is unchanged', () => {
  const root = repo();
  write(path.join(root, 'docs', 'plan.md'), 'plan\n');
  git(root, 'add', 'docs/plan.md');
  git(root, 'commit', '-q', '-m', 'plan');
  const before = git(root, 'status', '--porcelain');
  const out = move(root, [{ from: 'docs/plan.md', to: 'archive/plan.md', force: false }]);
  assert.strictEqual(out[0].status, 'skipped-tracked', JSON.stringify(out));
  assert.ok(out[0].reason);
  assert.ok(fs.existsSync(path.join(root, 'docs', 'plan.md')));
  assert.strictEqual(fs.existsSync(mem(root, 'archive', 'plan.md')), false);
  assert.strictEqual(git(root, 'status', '--porcelain'), before);
});

test('file inside a nested repo is skipped', () => {
  const root = repo();
  const nested = path.join(root, 'vendor-lib');
  fs.mkdirSync(nested);
  git(nested, 'init', '-q');
  write(path.join(nested, 'sub', 'notes.md'), 'n\n');
  const out = move(root, [{ from: 'vendor-lib/sub/notes.md', to: 'reference/notes.md', force: false }]);
  assert.strictEqual(out[0].status, 'skipped-nested-repo', JSON.stringify(out));
  assert.ok(fs.existsSync(path.join(nested, 'sub', 'notes.md')));
});

test('existing destination is never overwritten', () => {
  const root = repo();
  write(path.join(root, 'old.md'), 'new content\n');
  write(mem(root, 'archive', 'old.md'), 'already here\n');
  const out = move(root, [{ from: 'old.md', to: 'archive/old.md', force: false }]);
  assert.strictEqual(out[0].status, 'skipped-exists', JSON.stringify(out));
  assert.strictEqual(fs.readFileSync(mem(root, 'archive', 'old.md'), 'utf8'), 'already here\n');
  assert.ok(fs.existsSync(path.join(root, 'old.md')));
});

test('destination escaping the memory folder is rejected', () => {
  const root = repo();
  write(path.join(root, 'a.md'));
  const out = move(root, [
    { from: 'a.md', to: '../escaped.md', force: false },
    { from: '../outside.md', to: 'archive/outside.md', force: false },
    { from: '.project-memory/history.md', to: 'archive/h.md', force: false },
    { from: '.git/config', to: 'archive/config', force: false },
  ]);
  assert.deepStrictEqual(out.map((r) => r.status), ['error', 'error', 'error', 'error'], JSON.stringify(out));
  assert.ok(out.every((r) => r.reason));
  assert.ok(fs.existsSync(path.join(root, 'a.md')));
  assert.strictEqual(fs.existsSync(path.join(root, 'escaped.md')), false);
  assert.ok(fs.existsSync(mem(root, 'history.md')));
});

function commit(root, rel, text = 'x\n') {
  write(path.join(root, rel), text);
  git(root, 'add', rel);
  git(root, 'commit', '-q', '-m', rel);
}

test('tracked markdown doc with tracked:true moves and git shows exactly one deletion', () => {
  const root = repo();
  commit(root, 'docs/status.md', 'status\n');
  const out = move(root, [{ from: 'docs/status.md', to: 'archive/status.md', tracked: true }]);
  assert.strictEqual(out[0].status, 'moved-tracked', JSON.stringify(out));
  assert.strictEqual(fs.readFileSync(mem(root, 'archive', 'status.md'), 'utf8'), 'status\n');
  const lines = git(root, 'status', '--porcelain').split('\n').filter(Boolean);
  assert.deepStrictEqual(lines, [' D docs/status.md']);
});

test('legacy force flag still moves a tracked markdown doc', () => {
  const root = repo();
  commit(root, 'docs/Notes.MARKDOWN', 'n\n');
  const out = move(root, [{ from: 'docs/Notes.MARKDOWN', to: 'archive/notes.md', force: true }]);
  assert.strictEqual(out[0].status, 'moved-tracked', JSON.stringify(out));
  const lines = git(root, 'status', '--porcelain').split('\n').filter(Boolean);
  assert.deepStrictEqual(lines, [' D docs/Notes.MARKDOWN']);
});

test('tracked non-markdown files never move, even with tracked or force set', () => {
  const root = repo();
  for (const f of ['docs/notes.txt', 'config.json', 'img/logo.png']) commit(root, f);
  const before = git(root, 'status', '--porcelain');
  const out = move(root, [
    { from: 'docs/notes.txt', to: 'reference/notes.txt', tracked: true },
    { from: 'config.json', to: 'reference/config.json', force: true },
    { from: 'img/logo.png', to: 'reference/logo.png', tracked: true, force: true },
  ]);
  assert.deepStrictEqual(out.map((r) => r.status), ['skipped-tracked', 'skipped-tracked', 'skipped-tracked'], JSON.stringify(out));
  assert.ok(out.every((r) => r.reason === 'tracked non-markdown files never move'), JSON.stringify(out));
  for (const f of ['docs/notes.txt', 'config.json', 'img/logo.png']) assert.ok(fs.existsSync(path.join(root, f)));
  assert.strictEqual(git(root, 'status', '--porcelain'), before);
});

test('tracked files whose names merely end in md never move', () => {
  const root = repo();
  for (const f of ['build.cmd', 'x.rmd']) commit(root, f);
  const before = git(root, 'status', '--porcelain');
  const out = move(root, [
    { from: 'build.cmd', to: 'reference/build.cmd', tracked: true },
    { from: 'x.rmd', to: 'reference/x.rmd', force: true },
  ]);
  assert.deepStrictEqual(out.map((r) => r.status), ['skipped-tracked', 'skipped-tracked'], JSON.stringify(out));
  for (const f of ['build.cmd', 'x.rmd']) assert.ok(fs.existsSync(path.join(root, f)));
  assert.strictEqual(git(root, 'status', '--porcelain'), before);
});

test('untracked non-markdown file still moves', () => {
  const root = repo();
  write(path.join(root, 'scratch', 'todo.txt'), 't\n');
  const out = move(root, [{ from: 'scratch/todo.txt', to: 'archive/todo.txt' }]);
  assert.strictEqual(out[0].status, 'moved', JSON.stringify(out));
  assert.ok(fs.existsSync(mem(root, 'archive', 'todo.txt')));
  assert.strictEqual(git(root, 'status', '--porcelain'), '');
});

test('nested repo guard still applies with tracked or force set', () => {
  const root = repo();
  const nested = path.join(root, 'vendor-lib');
  fs.mkdirSync(nested);
  git(nested, 'init', '-q');
  write(path.join(nested, 'notes.md'), 'n\n');
  const out = move(root, [{ from: 'vendor-lib/notes.md', to: 'reference/notes.md', tracked: true, force: true }]);
  assert.strictEqual(out[0].status, 'skipped-nested-repo', JSON.stringify(out));
  assert.ok(fs.existsSync(path.join(nested, 'notes.md')));
});

test('non-git directory works', () => {
  const root = path.join(tmp(), 'plain');
  fs.mkdirSync(root);
  initMemory(root);
  write(path.join(root, 'notes.md'), 'n\n');
  const out = move(root, [{ from: 'notes.md', to: 'reference/notes.md', force: false }]);
  assert.strictEqual(out[0].status, 'moved', JSON.stringify(out));
  assert.ok(fs.existsSync(mem(root, 'reference', 'notes.md')));
  assert.strictEqual(fs.existsSync(path.join(root, 'notes.md')), false);
});

test('missing source is reported as error; bad usage exits 1', () => {
  const root = repo();
  const out = move(root, [{ from: 'ghost.md', to: 'archive/ghost.md', force: false }]);
  assert.strictEqual(out[0].status, 'error');
  const r = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  const r2 = spawnSync(process.execPath, [script, root, path.join(root, 'no-such-plan.json')], { encoding: 'utf8' });
  assert.strictEqual(r2.status, 1);
});

test('tracked file named in different case is still skipped as tracked', (t) => {
  const root = repo();
  write(path.join(root, 'docs', 'Plan.md'), 'plan\n');
  git(root, 'add', 'docs/Plan.md');
  git(root, 'commit', '-q', '-m', 'plan');
  if (!fs.existsSync(path.join(root, 'docs', 'plan.md'))) {
    t.skip('case-sensitive filesystem');
    return;
  }
  const before = git(root, 'status', '--porcelain');
  const out = move(root, [{ from: 'docs/plan.md', to: 'archive/plan.md', force: false }]);
  assert.strictEqual(out[0].status, 'skipped-tracked', JSON.stringify(out));
  assert.strictEqual(out[0].from, 'docs/Plan.md');
  assert.ok(fs.existsSync(path.join(root, 'docs', 'Plan.md')));
  assert.strictEqual(fs.existsSync(mem(root, 'archive', 'plan.md')), false);
  assert.strictEqual(git(root, 'status', '--porcelain'), before);
});

test('git failure is an error, and the file is not moved', () => {
  const root = repo();
  write(path.join(root, 'notes.md'), 'n\n');
  const out = move(root, [{ from: 'notes.md', to: 'reference/notes.md', force: false }], {
    GIT_DIR: path.join(root, 'no-such-git-dir'),
  });
  assert.strictEqual(out[0].status, 'error', JSON.stringify(out));
  assert.ok(out[0].reason, 'reason carries git stderr');
  assert.ok(fs.existsSync(path.join(root, 'notes.md')));
  assert.strictEqual(fs.existsSync(mem(root, 'reference', 'notes.md')), false);
});
