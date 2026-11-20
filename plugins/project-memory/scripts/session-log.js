'use strict';
// CLI used by /wrap-up:
//   node session-log.js show <projectDir> <sessionId>
//     Prints this session's activity log (and any abandoned sessions) as Markdown.
//   node session-log.js done <projectDir> <sessionId> [<otherId>...]
//     Marks each listed session log as processed.
const fs = require('node:fs');
const path = require('node:path');
const { resolveProject } = require('../lib/paths');
const { safeId, listUnprocessed, markProcessed } = require('../lib/logs');

const UNTRACKED = "This project isn't tracked by project-memory.";
const NO_LOG = 'No activity log for this session.';
const UNREADABLE = 'log unreadable or empty';

function readEvents(memDir, sessionId) {
  const file = path.join(memDir, 'state', 'sessions', `${safeId(sessionId)}.jsonl`);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip a torn line */
    }
  }
  return events;
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Inline code that survives backticks inside the text.
function code(s) {
  const runs = s.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = s.startsWith('`') || s.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${s}${pad}${fence}`;
}

function renderSession(events) {
  const out = [];
  const first = events.find((e) => e.ts);
  out.push(`First event: ${first ? first.ts : 'unknown'}`);

  const prompts = events.filter((e) => e.type === 'prompt').map((e) => oneLine(e.text));
  const files = new Map();
  const commands = [];
  const compactions = [];
  for (const e of events) {
    if (e.type === 'tool' && Array.isArray(e.files)) {
      for (const f of e.files) files.set(f, (files.get(f) || 0) + 1);
    } else if (e.type === 'tool' && e.cmd) {
      commands.push(`- ${code(oneLine(e.cmd))}${e.isCommit ? ' **(commit)**' : ''}`);
    } else if (e.type === 'compact') {
      compactions.push(`- ${e.ts || 'unknown time'} (${e.trigger || 'unknown'})`);
    }
  }

  if (prompts.length) {
    out.push('', '#### Prompts');
    prompts.forEach((p, i) => out.push(`${i + 1}. ${p}`));
  }
  if (files.size) {
    out.push('', '#### Files touched');
    for (const [f, n] of files) out.push(`- ${f} (${n})`);
  }
  if (commands.length) out.push('', '#### Bash commands', ...commands);
  if (compactions.length) out.push('', '#### Compactions', ...compactions);
  return out.join('\n');
}

function show(memDir, sessionId) {
  const parts = [`Memory folder: ${memDir}`, '## This session'];
  const events = readEvents(memDir, sessionId);
  parts.push(events && events.length ? renderSession(events) : NO_LOG);
  for (const id of listUnprocessed(memDir, sessionId, new Date())) {
    // Even an empty or unreadable log gets a section, so wrap-up can pass its id to `done`.
    const old = readEvents(memDir, id);
    const body = old && old.length ? renderSession(old) : UNREADABLE;
    parts.push(`## Abandoned session ${id}\n\n${body}`);
  }
  return parts.join('\n\n') + '\n';
}

function main() {
  const [cmd, projectDir, sessionId, ...others] = process.argv.slice(2);
  if (!['show', 'done'].includes(cmd) || !projectDir || !sessionId) {
    throw new Error('usage: node session-log.js show|done <projectDir> <sessionId> [<otherId>...]');
  }
  const { memDir, tracked } = resolveProject(projectDir);
  if (!tracked) {
    process.stdout.write(UNTRACKED + '\n');
    return;
  }
  if (cmd === 'show') {
    process.stdout.write(show(memDir, sessionId));
    return;
  }
  const ids = [sessionId, ...others];
  const now = new Date();
  const moved = [];
  const missing = [];
  for (const id of ids) (markProcessed(memDir, id, now) === 'moved' ? moved : missing).push(safeId(id));
  if (moved.length) process.stdout.write(`Marked processed: ${moved.join(', ')}\n`);
  if (missing.length) process.stdout.write(`Marked wrapped (no activity log): ${missing.join(', ')}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`session-log: ${e.message}\n`);
  process.exit(1);
}
