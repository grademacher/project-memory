'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendEvent, listUnprocessed, markProcessed, cleanupProcessed } = require('../lib/logs');

const HOUR = 3600 * 1000;
function setup() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-logs-'));
}
function age(file, ms, now) {
  const t = new Date(now.getTime() - ms);
  fs.utimesSync(file, t, t);
}
const logPath = (m, id) => path.join(m, 'state', 'sessions', id + '.jsonl');

test('current session never listed', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'cur', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), []);
});

test('log with end marker listed', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'prompt' });
  appendEvent(m, 'a', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), ['a']);
});

test('live log under 12h without end NOT listed', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'prompt' });
  age(logPath(m, 'a'), 11 * HOUR, now);
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), []);
});

test('stale log over 12h listed', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'prompt' });
  age(logPath(m, 'a'), 13 * HOUR, now);
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), ['a']);
});

test('markProcessed moves file and appends wrapped', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'end' });
  markProcessed(m, 'a', now);
  assert.strictEqual(fs.existsSync(logPath(m, 'a')), false);
  const moved = path.join(m, 'state', 'sessions', 'processed', 'a.jsonl');
  const lines = fs.readFileSync(moved, 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(lines[lines.length - 1].type, 'wrapped');
  assert.strictEqual(lines[lines.length - 1].ts, now.toISOString());
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), []);
});

test('markProcessed with no source log records a wrapped marker', () => {
  const m = setup(); const now = new Date();
  assert.strictEqual(markProcessed(m, 'missing', now), 'recorded');
  const dest = path.join(m, 'state', 'sessions', 'processed', 'missing.jsonl');
  const lines = fs.readFileSync(dest, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(lines, [{ ts: now.toISOString(), type: 'wrapped' }]);
  assert.strictEqual(fs.existsSync(logPath(m, 'missing')), false);
  // SessionEnd later creates an end-only log for the same id: not an un-wrapped session.
  appendEvent(m, 'missing', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), []);
});

test('markProcessed appends to an existing processed log (resumed session)', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'prompt', text: 'first' });
  markProcessed(m, 'a', now);
  appendEvent(m, 'a', { type: 'prompt', text: 'second' });
  markProcessed(m, 'a', now);
  assert.strictEqual(fs.existsSync(logPath(m, 'a')), false);
  const moved = path.join(m, 'state', 'sessions', 'processed', 'a.jsonl');
  const lines = fs.readFileSync(moved, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(lines.map((l) => l.text || l.type), ['first', 'wrapped', 'second', 'wrapped']);
});

function processedFile(m, id) {
  const dir = path.join(m, 'state', 'sessions', 'processed');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id + '.jsonl'), JSON.stringify({ type: 'wrapped' }) + '\n');
}

test('post-wrap chatter of an already-processed session not listed', () => {
  const m = setup(); const now = new Date();
  processedFile(m, 'a');
  appendEvent(m, 'a', { type: 'prompt', text: 'thanks' });
  appendEvent(m, 'a', { type: 'tool', tool: 'Bash', cmd: 'ls', isCommit: false });
  appendEvent(m, 'a', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), []);
});

test('real work after a wrap-up of the same session is listed', () => {
  const m = setup(); const now = new Date();
  processedFile(m, 'a');
  appendEvent(m, 'a', { type: 'tool', tool: 'Edit', files: ['src/a.js'] });
  appendEvent(m, 'a', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), ['a']);
});

test('commit after a wrap-up of the same session is listed', () => {
  const m = setup(); const now = new Date();
  processedFile(m, 'a');
  appendEvent(m, 'a', { type: 'tool', tool: 'Bash', cmd: 'git commit -m x', isCommit: true });
  appendEvent(m, 'a', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), ['a']);
});

test('prompt-only ended log never processed is listed', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'prompt', text: 'hi' });
  appendEvent(m, 'a', { type: 'end' });
  assert.deepStrictEqual(listUnprocessed(m, 'cur', now), ['a']);
});

test('markProcessed returns moved when a log was moved, recorded when none', () => {
  const m = setup(); const now = new Date();
  appendEvent(m, 'a', { type: 'end' });
  assert.strictEqual(markProcessed(m, 'a', now), 'moved');
  assert.strictEqual(markProcessed(m, 'a', now), 'recorded');
});

test('cleanupProcessed deletes only over 30 days', () => {
  const m = setup(); const now = new Date();
  for (const id of ['old', 'new']) { appendEvent(m, id, { type: 'end' }); markProcessed(m, id, now); }
  const dir = path.join(m, 'state', 'sessions', 'processed');
  age(path.join(dir, 'old.jsonl'), 31 * 24 * HOUR, now);
  age(path.join(dir, 'new.jsonl'), 29 * 24 * HOUR, now);
  assert.strictEqual(cleanupProcessed(m, now), 1);
  assert.deepStrictEqual(fs.readdirSync(dir), ['new.jsonl']);
});
