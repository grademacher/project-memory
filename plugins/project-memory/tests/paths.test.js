'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveProject, normalizeForCompare, relativeToRoot } = require('../lib/paths.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-paths-'));
}
function mk(...p) {
  const d = path.join(...p);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function same(a, b) {
  assert.strictEqual(normalizeForCompare(a), normalizeForCompare(b));
}

test('plain repo: subdir resolves to root', () => {
  const t = tmp();
  const repo = mk(t, 'repo');
  mk(repo, '.git');
  const deep = mk(repo, 'src', 'deep');
  const r = resolveProject(deep);
  same(r.mainRoot, repo);
  same(r.memDir, path.join(repo, '.project-memory'));
  assert.strictEqual(r.isGit, true);
  assert.strictEqual(r.tracked, false);
});

test('worktree resolves to main checkout', () => {
  const t = tmp();
  const repo = mk(t, 'repo');
  const wtMeta = mk(repo, '.git', 'worktrees', 'wt');
  fs.writeFileSync(path.join(wtMeta, 'commondir'), '../..\n');
  const wt = mk(t, 'wt');
  fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${wtMeta}\n`);
  const r = resolveProject(mk(wt, 'sub'));
  same(r.mainRoot, repo);
  assert.strictEqual(r.isGit, true);
});

test('relative gitdir is resolved against the .git file\'s dir', () => {
  const t = tmp();
  const repo = mk(t, 'repo');
  const wtMeta = mk(repo, '.git', 'worktrees', 'wt');
  fs.writeFileSync(path.join(wtMeta, 'commondir'), '../..');
  const wt = mk(t, 'wt');
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../repo/.git/worktrees/wt\n');
  same(resolveProject(wt).mainRoot, repo);
});

test('submodule (.git file, no commondir) stays in place', () => {
  const t = tmp();
  const meta = mk(t, 'super', '.git', 'modules', 'sm');
  const sm = mk(t, 'super', 'sm');
  fs.writeFileSync(path.join(sm, '.git'), `gitdir: ${meta}\n`);
  const r = resolveProject(mk(sm, 'x'));
  same(r.mainRoot, sm);
  assert.strictEqual(r.isGit, true);
});

test('no git: mainRoot is startDir', () => {
  const t = tmp();
  const d = mk(t, 'plain', 'dir');
  const r = resolveProject(d);
  same(r.mainRoot, d);
  assert.strictEqual(r.isGit, false);
});

test('tracked when config.json exists', () => {
  const t = tmp();
  const repo = mk(t, 'repo');
  mk(repo, '.git');
  mk(repo, '.project-memory');
  fs.writeFileSync(path.join(repo, '.project-memory', 'config.json'), '{}');
  assert.strictEqual(resolveProject(repo).tracked, true);
});

test('path with spaces', () => {
  const t = tmp();
  const repo = mk(t, 'My Projects', 'app');
  mk(repo, '.git');
  same(resolveProject(mk(repo, 'a b')).mainRoot, repo);
});

test('relativeToRoot turns absolute paths into forward-slash relative', () => {
  const root = path.join(os.tmpdir(), 'repo');
  assert.strictEqual(relativeToRoot(root, path.join(root, 'src', 'a.js')), 'src/a.js');
});

test('relativeToRoot returns outside paths unchanged', () => {
  const root = path.join(os.tmpdir(), 'repo');
  const other = path.join(os.tmpdir(), 'elsewhere', 'b.js');
  assert.strictEqual(relativeToRoot(root, other), other);
});
