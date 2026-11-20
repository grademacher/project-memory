'use strict';
// Pure filesystem resolution of the project root. Never spawns git.
const fs = require('node:fs');
const path = require('node:path');

const MEM_DIR_NAME = '.project-memory';

function normalizeForCompare(p) {
  const n = path.resolve(p).split(path.sep).join('/');
  return process.platform === 'win32' ? n.toLowerCase() : n;
}

function relativeToRoot(mainRoot, file) {
  const root = normalizeForCompare(mainRoot).replace(/\/+$/, '');
  const abs = path.resolve(file).split(path.sep).join('/');
  const absCmp = normalizeForCompare(file);
  if (absCmp === root) return '';
  if (absCmp.startsWith(root + '/')) return abs.slice(root.length + 1);
  return file;
}

function readTrim(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

// Given a `.git` file in `dir`, return the main checkout root (or `dir` if
// it is not a linked worktree, e.g. a submodule).
function rootFromGitFile(dir, gitFile) {
  const m = /^gitdir:\s*(.+)$/m.exec(readTrim(gitFile) || '');
  if (!m) return dir;
  const gitdir = path.resolve(dir, m[1].trim());
  const common = readTrim(path.join(gitdir, 'commondir'));
  if (!common) return dir;
  return path.dirname(path.resolve(gitdir, common));
}

function resolveProject(startDir) {
  const start = path.resolve(startDir);
  let mainRoot = start;
  let isGit = false;
  let dir = start;
  for (;;) {
    const dotGit = path.join(dir, '.git');
    let st = null;
    try {
      st = fs.statSync(dotGit);
    } catch {
      /* not here */
    }
    if (st) {
      isGit = true;
      mainRoot = st.isDirectory() ? dir : rootFromGitFile(dir, dotGit);
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const memDir = path.join(mainRoot, MEM_DIR_NAME);
  const tracked = fs.existsSync(path.join(memDir, 'config.json'));
  return { mainRoot, memDir, isGit, tracked };
}

module.exports = { resolveProject, normalizeForCompare, relativeToRoot };
