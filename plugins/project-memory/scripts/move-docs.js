'use strict';
// CLI used by /setup-tracking:
//   node move-docs.js <projectDir> <planFile>
// The plan is a JSON array of {"from": "<path relative to the main checkout>",
// "to": "<path relative to the memory folder>", "tracked": false}. Moves each
// file into the memory folder without ever overwriting. Files inside a nested
// repo are always skipped. A file git tracks moves only when the row sets
// "tracked": true (legacy alias: "force") and it is markdown (.md/.markdown);
// that move is reported as "moved-tracked" because git will show a deletion.
// Tracked non-markdown files never move. Prints a JSON array with one
// {from, to, status, reason} per row; exits 0 even when rows are skipped
// (1 only for bad usage or an unreadable plan).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveProject, normalizeForCompare } = require('../lib/paths');

function inside(dir, p) {
  const d = normalizeForCompare(dir).replace(/\/+$/, '');
  const f = normalizeForCompare(p);
  return f.startsWith(d + '/');
}

function same(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function readPlan(file) {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(plan)) throw new Error('plan must be a JSON array');
  return plan;
}

// Looks for a .git entry in from's folder or any folder between it and the root.
function inNestedRepo(mainRoot, from) {
  let dir = path.dirname(from);
  while (inside(mainRoot, dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    dir = path.dirname(dir);
  }
  return false;
}

// Returns 'tracked', 'untracked', or {error}. Only exit 1 means untracked:
// any other failure (spawn error, dubious ownership, corrupt index) must not
// be read as permission to move. `:(icase)` makes an index entry that differs
// only in case still count, since --error-unmatch matches case-sensitively.
function trackedState(from) {
  const r = spawnSync(
    'git',
    ['-C', path.dirname(from), 'ls-files', '--error-unmatch', '--', `:(icase)${path.basename(from)}`],
    { encoding: 'utf8' }
  );
  if (r.error) return { error: `git failed: ${r.error.message}` };
  if (r.status === 0) return 'tracked';
  if (r.status === 1) return 'untracked';
  return { error: `git ls-files failed (exit ${r.status}): ${String(r.stderr || '').trim()}` };
}

function isMarkdown(p) {
  const ext = path.extname(p).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

function moveFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.unlinkSync(from);
  }
}

function moveOne(project, entry) {
  const { mainRoot, memDir, isGit } = project;
  const fromRel = entry && typeof entry.from === 'string' ? entry.from : '';
  const toRel = entry && typeof entry.to === 'string' ? entry.to : '';
  let reportedFrom = fromRel;
  const row = (status, reason) => ({ from: reportedFrom, to: toRel, status, reason });
  if (!fromRel || !toRel) return row('error', 'from and to must be non-empty strings');

  const planned = path.resolve(mainRoot, fromRel);
  const to = path.resolve(memDir, toRel);
  const checkSource = (root, p) => {
    if (!inside(root, p)) return 'from is outside the project root';
    const mem = path.join(root, path.basename(memDir));
    if (same(p, mem) || inside(mem, p)) return 'from is inside the memory folder';
    const dotGit = path.join(root, '.git');
    if (same(p, dotGit) || inside(dotGit, p)) return 'from is inside .git';
    return null;
  };
  const bad = checkSource(mainRoot, planned);
  if (bad) return row('error', bad);
  if (!inside(memDir, to)) return row('error', 'to is outside the memory folder');

  let st;
  try {
    st = fs.statSync(planned);
  } catch {
    return row('error', 'source not found');
  }
  if (!st.isFile()) return row('error', 'source is not a file');

  // Use the real on-disk path (true case, symlinks resolved) for every check,
  // the move and the report, so a plan path in the wrong case can't slip past git.
  const realRoot = fs.realpathSync.native(mainRoot);
  const from = fs.realpathSync.native(planned);
  const badReal = checkSource(realRoot, from);
  if (badReal) return row('error', badReal);
  reportedFrom = path.relative(realRoot, from).split(path.sep).join('/');

  if (inNestedRepo(realRoot, from)) return row('skipped-nested-repo', 'inside a nested repo, submodule or worktree');
  let tracked = false;
  if (isGit) {
    const state = trackedState(from);
    if (state === 'tracked') {
      if (!isMarkdown(from)) return row('skipped-tracked', 'tracked non-markdown files never move');
      if (!(entry.tracked === true || entry.force === true)) return row('skipped-tracked', 'git tracks this file and the plan did not mark it tracked');
      tracked = true;
    } else if (state !== 'untracked') {
      return row('error', state.error);
    }
  }
  if (fs.existsSync(to)) return row('skipped-exists', 'destination already exists');

  moveFile(from, to);
  if (!fs.existsSync(to) || fs.existsSync(from)) return row('error', 'move could not be verified');
  return row(tracked ? 'moved-tracked' : 'moved', '');
}

function main() {
  const [projectDir, planFile] = process.argv.slice(2);
  if (!projectDir || !planFile) throw new Error('usage: node move-docs.js <projectDir> <planFile>');
  const plan = readPlan(planFile);
  const project = resolveProject(projectDir);
  const results = plan.map((entry) => {
    try {
      return moveOne(project, entry);
    } catch (e) {
      return {
        from: entry && entry.from,
        to: entry && entry.to,
        status: 'error',
        reason: e.message,
      };
    }
  });
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

try {
  main();
} catch (e) {
  process.stderr.write(`move-docs: ${e.message}\n`);
  process.exit(1);
}
