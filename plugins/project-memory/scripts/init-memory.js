'use strict';
// CLI: node init-memory.js <projectDir> [--name "<Project name>"]
// Creates the .project-memory folder (idempotent) and hides it from git via
// .git/info/exclude. Never touches tracked files.
const fs = require('node:fs');
const path = require('node:path');
const { resolveProject } = require('../lib/paths');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const TEMPLATES = ['history.md', 'roadmap.md', 'lessons.md', 'sessions.md'];
const SUBDIRS = ['research', 'reference', 'archive', path.join('state', 'sessions')];
const EXCLUDE_LINE = '/.project-memory/';

function parseArgs(argv) {
  let dir = null;
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') name = argv[++i];
    else if (dir === null) dir = argv[i];
  }
  return { dir, name };
}

function writeIfMissing(file, content) {
  try {
    fs.writeFileSync(file, content, { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

// <mainRoot>/.git is a directory for a normal checkout, or a `gitdir:` file
// (e.g. a submodule or a --separate-git-dir repo).
function excludePath(mainRoot) {
  const dotGit = path.join(mainRoot, '.git');
  if (fs.statSync(dotGit).isDirectory()) return path.join(dotGit, 'info', 'exclude');
  const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
  if (!m) throw new Error(`cannot read gitdir from ${dotGit}`);
  return path.join(path.resolve(mainRoot, m[1].trim()), 'info', 'exclude');
}

function ensureExclude(mainRoot) {
  const file = excludePath(mainRoot);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (text.split(/\r?\n/).some((l) => l.trim() === EXCLUDE_LINE)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sep = text && !text.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${sep}${EXCLUDE_LINE}\n`);
  return true;
}

function main() {
  const { dir, name } = parseArgs(process.argv.slice(2));
  if (!dir) throw new Error('usage: node init-memory.js <projectDir> [--name "<Project name>"]');
  const { mainRoot, memDir, isGit } = resolveProject(dir);
  const project = name && name.trim() ? name.trim() : path.basename(mainRoot);

  // Hide the folder before creating it, so a failure never leaves it visible to git.
  const excludeAdded = isGit ? ensureExclude(mainRoot) : false;

  for (const sub of SUBDIRS) fs.mkdirSync(path.join(memDir, sub), { recursive: true });

  const created = [];
  for (const t of TEMPLATES) {
    const content = fs.readFileSync(path.join(TEMPLATES_DIR, t), 'utf8').split('{{PROJECT}}').join(project);
    if (writeIfMissing(path.join(memDir, t), content)) created.push(t);
  }
  if (writeIfMissing(path.join(memDir, 'config.json'), JSON.stringify({ version: 1, deadEndCheck: false }) + '\n')) {
    created.push('config.json');
  }

  process.stdout.write(JSON.stringify({ memDir, created, excludeAdded, isGit }) + '\n');
}

try {
  main();
} catch (e) {
  process.stderr.write(`init-memory: ${e.message}\n`);
  process.exit(1);
}
