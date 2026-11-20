'use strict';
const fs = require('node:fs');
const path = require('node:path');

const STALE_MS = 12 * 3600 * 1000;
const PROCESSED_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function safeId(sessionId) {
  return String(sessionId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown';
}

function sessionsDir(memDir) {
  return path.join(memDir, 'state', 'sessions');
}

function appendEvent(memDir, sessionId, event) {
  const dir = sessionsDir(memDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${safeId(sessionId)}.jsonl`), JSON.stringify(event) + '\n');
}

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
}

function lastEventType(file) {
  try {
    const lines = readLines(file);
    return JSON.parse(lines[lines.length - 1]).type;
  } catch {
    return null;
  }
}

// True when the log holds real work: a file edit or a commit.
function hasWork(file) {
  for (const line of readLines(file)) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'tool' && ((Array.isArray(e.files) && e.files.length > 0) || e.isCommit === true)) return true;
    } catch { /* skip torn line */ }
  }
  return false;
}

function listUnprocessed(memDir, currentSessionId, now) {
  const dir = sessionsDir(memDir);
  const current = safeId(currentSessionId);
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const id = name.slice(0, -'.jsonl'.length);
    if (id === current) continue;
    const file = path.join(dir, name);
    try {
      if (!fs.statSync(file).isFile()) continue;
      const stale = now.getTime() - fs.statSync(file).mtimeMs > STALE_MS;
      if (!(lastEventType(file) === 'end' || stale)) continue;
      // Chatter after this same session was already wrapped up doesn't count.
      if (fs.existsSync(path.join(dir, 'processed', name)) && !hasWork(file)) continue;
      out.push(id);
    } catch { /* skip unreadable */ }
  }
  return out;
}

// Moves the log to processed/. A resumed session keeps its id, so a second
// wrap-up appends to the already-processed log instead of overwriting it.
// With no log to move (e.g. setup-tracking, where the project only becomes
// tracked mid-session), still records a wrapped marker in processed/ so a later
// end-only log for this id isn't reported as an un-wrapped session.
// Returns 'moved' or 'recorded'.
function markProcessed(memDir, sessionId, now) {
  const id = safeId(sessionId);
  const src = path.join(sessionsDir(memDir), `${id}.jsonl`);
  const destDir = path.join(sessionsDir(memDir), 'processed');
  fs.mkdirSync(destDir, { recursive: true });
  const marker = JSON.stringify({ ts: now.toISOString(), type: 'wrapped' }) + '\n';
  if (!fs.existsSync(src)) {
    const file = path.join(destDir, `${id}.jsonl`);
    fs.appendFileSync(file, marker);
    fs.utimesSync(file, now, now);
    return 'recorded';
  }
  fs.appendFileSync(src, marker);
  const dest = path.join(destDir, `${id}.jsonl`);
  if (fs.existsSync(dest)) {
    fs.appendFileSync(dest, fs.readFileSync(src, 'utf8'));
    fs.unlinkSync(src);
  } else {
    fs.renameSync(src, dest);
  }
  fs.utimesSync(dest, now, now);
  return 'moved';
}

function cleanupProcessed(memDir, now) {
  const dir = path.join(sessionsDir(memDir), 'processed');
  let names;
  try { names = fs.readdirSync(dir); } catch { return 0; }
  let count = 0;
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (now.getTime() - fs.statSync(file).mtimeMs > PROCESSED_MAX_AGE_MS) {
        fs.unlinkSync(file);
        count++;
      }
    } catch { /* skip */ }
  }
  return count;
}

module.exports = { safeId, appendEvent, listUnprocessed, markProcessed, cleanupProcessed };
