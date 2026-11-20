'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'scripts', 'init-memory.js');
const templatesDir = path.join(__dirname, '..', 'templates');
const { getSection } = require('../lib/sections');

const HEADINGS = {
  'history.md': ['What this project is', 'Dead ends', 'Timeline', 'Prior docs'],
  'roadmap.md': ['Hard constraints', 'Active', 'Awaiting verification', 'Queue', 'Parked'],
  'lessons.md': ['Open', 'Retired', 'Candidates'],
};

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-init-')));
}

function gitRepo({ commit } = {}) {
  const dir = path.join(tmp(), 'repo');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q');
  if (commit) {
    fs.writeFileSync(path.join(dir, 'README.md'), '# demo\n');
    git(dir, 'add', 'README.md');
    git(dir, 'commit', '-q', '-m', 'init');
  }
  return dir;
}

function init(dir, ...extra) {
  const r = spawnSync(process.execPath, [script, dir, ...extra], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `init failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function excludeLines(repo) {
  return fs
    .readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l === '/.project-memory/');
}

test('creates folders, templates, config', () => {
  const repo = gitRepo();
  const out = init(repo, '--name', 'Demo App');
  const mem = path.join(repo, '.project-memory');
  assert.strictEqual(path.resolve(out.memDir), mem);
  assert.strictEqual(out.isGit, true);
  for (const d of ['research', 'reference', 'archive', path.join('state', 'sessions')]) {
    assert.ok(fs.statSync(path.join(mem, d)).isDirectory(), d);
  }
  for (const f of ['history.md', 'roadmap.md', 'lessons.md', 'sessions.md']) {
    const text = fs.readFileSync(path.join(mem, f), 'utf8');
    assert.ok(!text.includes('{{PROJECT}}'), f);
  }
  assert.match(fs.readFileSync(path.join(mem, 'history.md'), 'utf8'), /^# Demo App — project history/);
  assert.match(fs.readFileSync(path.join(mem, 'roadmap.md'), 'utf8'), /^# Demo App — roadmap/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(mem, 'config.json'), 'utf8')), { version: 1, deadEndCheck: false });
  assert.deepStrictEqual(
    [...out.created].sort(),
    ['config.json', 'history.md', 'lessons.md', 'roadmap.md', 'sessions.md'],
  );
});

test('default name is the basename of the main root', () => {
  const repo = gitRepo();
  init(repo);
  const text = fs.readFileSync(path.join(repo, '.project-memory', 'history.md'), 'utf8');
  assert.match(text, /^# repo — project history/);
});

test('adds exclude line once across two runs', () => {
  const repo = gitRepo();
  const exclude = path.join(repo, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, '# existing, no trailing newline');
  const first = init(repo);
  const second = init(repo);
  assert.strictEqual(first.excludeAdded, true);
  assert.strictEqual(second.excludeAdded, false);
  assert.deepStrictEqual(second.created, []);
  assert.strictEqual(excludeLines(repo).length, 1);
  assert.match(fs.readFileSync(exclude, 'utf8'), /^# existing, no trailing newline\n\/\.project-memory\/\n$/);
});

test('creates the exclude file when missing', () => {
  const repo = gitRepo();
  fs.rmSync(path.join(repo, '.git', 'info'), { recursive: true, force: true });
  const out = init(repo);
  assert.strictEqual(out.excludeAdded, true);
  assert.strictEqual(excludeLines(repo).length, 1);
});

test('git status --porcelain is empty after init', () => {
  const repo = gitRepo({ commit: true });
  assert.strictEqual(git(repo, 'status', '--porcelain'), '');
  init(repo);
  assert.strictEqual(git(repo, 'status', '--porcelain'), '');
});

test('does not overwrite an existing roadmap.md', () => {
  const repo = gitRepo();
  const mem = path.join(repo, '.project-memory');
  fs.mkdirSync(mem);
  fs.writeFileSync(path.join(mem, 'roadmap.md'), 'MINE\n');
  const out = init(repo);
  assert.strictEqual(fs.readFileSync(path.join(mem, 'roadmap.md'), 'utf8'), 'MINE\n');
  assert.ok(!out.created.includes('roadmap.md'));
  assert.ok(out.created.includes('history.md'));
});

test('does not overwrite an existing config.json', () => {
  const repo = gitRepo();
  const mem = path.join(repo, '.project-memory');
  fs.mkdirSync(mem);
  fs.writeFileSync(path.join(mem, 'config.json'), '{"version":1,"deadEndCheck":true}\n');
  const out = init(repo);
  assert.strictEqual(fs.readFileSync(path.join(mem, 'config.json'), 'utf8'), '{"version":1,"deadEndCheck":true}\n');
  assert.ok(!out.created.includes('config.json'));
});

test('in a worktree (git worktree add), memDir is in the main checkout', () => {
  const main = gitRepo({ commit: true });
  const wt = path.join(path.dirname(main), 'wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'wt');
  const out = init(wt);
  assert.strictEqual(path.resolve(out.memDir), path.join(main, '.project-memory'));
  assert.ok(fs.existsSync(path.join(main, '.project-memory', 'config.json')));
  assert.ok(!fs.existsSync(path.join(wt, '.project-memory')));
  assert.strictEqual(git(main, 'status', '--porcelain'), '');
  assert.strictEqual(git(wt, 'status', '--porcelain'), '');
});

test('.git file without commondir (submodule-style): exclude goes into the gitdir', () => {
  const base = tmp();
  const sub = path.join(base, 'sub');
  const gitdir = path.join(base, 'gd');
  git(base, 'init', '-q', '--separate-git-dir', gitdir, sub);
  fs.writeFileSync(path.join(sub, 'README.md'), '# sub\n');
  git(sub, 'add', 'README.md');
  git(sub, 'commit', '-q', '-m', 'init');
  assert.ok(fs.statSync(path.join(sub, '.git')).isFile());
  const out = init(sub);
  assert.strictEqual(path.resolve(out.memDir), path.join(sub, '.project-memory'));
  assert.strictEqual(out.excludeAdded, true);
  const lines = fs.readFileSync(path.join(gitdir, 'info', 'exclude'), 'utf8').split(/\r?\n/);
  assert.strictEqual(lines.filter((l) => l === '/.project-memory/').length, 1);
  assert.strictEqual(git(sub, 'status', '--porcelain'), '');
});

test('exclude failure: exits 1 and does not create the memory folder', () => {
  const dir = path.join(tmp(), 'broken');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'blocker'), 'a regular file');
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: blocker/gd\n');
  const r = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /init-memory:/);
  assert.ok(!fs.existsSync(path.join(dir, '.project-memory')));
});

test('non-git dir: creates folder, excludeAdded false', () => {
  const dir = path.join(tmp(), 'plain');
  fs.mkdirSync(dir);
  const out = init(dir);
  assert.strictEqual(out.isGit, false);
  assert.strictEqual(out.excludeAdded, false);
  assert.ok(fs.existsSync(path.join(dir, '.project-memory', 'config.json')));
  assert.ok(fs.existsSync(path.join(dir, '.project-memory', 'roadmap.md')));
});

test('templates contain every required heading', () => {
  for (const [file, headings] of Object.entries(HEADINGS)) {
    const lines = fs.readFileSync(path.join(templatesDir, file), 'utf8').split(/\r?\n/);
    const found = lines.filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
    assert.deepStrictEqual(found, headings, file);
  }
  const lessons = fs.readFileSync(path.join(templatesDir, 'lessons.md'), 'utf8');
  assert.ok(
    lessons.includes('| Lesson (correct behavior) | Failure it prevents | Origin (date, context) | Clean streak | Relapses |'),
  );
  assert.ok(lessons.includes('| Lesson | Retired on |'));
  const roadmap = fs.readFileSync(path.join(templatesDir, 'roadmap.md'), 'utf8');
  assert.ok(roadmap.includes('| Item | What to check |'));
  assert.ok(roadmap.includes('| Item | Blocker |'));
  const hard = getSection(roadmap, 'Hard constraints');
  assert.deepStrictEqual(
    hard.split('\n').filter((l) => /^### /.test(l)),
    ['### Rules for Claude', '### Technical limits & requirements'],
  );
  assert.match(fs.readFileSync(path.join(templatesDir, 'lessons.md'), 'utf8'), /^# Lessons — how we work/);
  assert.match(fs.readFileSync(path.join(templatesDir, 'sessions.md'), 'utf8'), /^# /);
});
