'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { getSection } = require('./sections');

const MAX_CHARS = 8000;
const HARD = '### Roadmap — Hard constraints';
const AGREEMENTS = '### Roadmap — Working agreements';
const DEAD_ENDS = '### History — Dead ends';
const LESSONS = '### Lessons — Open';
// Over the cap, sections are cut in this order. The header and notice never are.
const CUT_ORDER = [DEAD_ENDS, LESSONS, HARD, AGREEMENTS];
const TRUNC = (file) => `… (truncated — read ${file})`;
const DEAD_END_RULE =
  '- If the current approach matches an entry under Dead ends, say so in one line, citing the entry. Only flag clear matches.';

// Drops ### subsections that have no content (a fresh template has two).
function dropEmptySubsections(body) {
  const units = [];
  for (const line of body.split('\n')) {
    if (/^### /.test(line) || !units.length) units.push([line]);
    else units[units.length - 1].push(line);
  }
  return units
    .filter((u) => !/^### /.test(u[0]) || u.slice(1).some((l) => l.trim()))
    .map((u) => u.join('\n'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function readDoc(memDir, file) {
  try { return fs.readFileSync(path.join(memDir, file), 'utf8'); } catch { return null; }
}

// Returns [{label, file, text}] for the non-empty sections, in layout order.
function collectSections(memDir, deadEndCheck) {
  const out = [];
  const add = (label, file, text) => {
    if (text && text.trim()) out.push({ label, file, text: text.trim() });
  };

  const roadmap = readDoc(memDir, 'roadmap.md');
  if (roadmap !== null) {
    const hard = getSection(roadmap, 'Hard constraints');
    // Older roadmaps keep their rules under Working agreements.
    if (hard === null) add(AGREEMENTS, 'roadmap.md', getSection(roadmap, 'Working agreements'));
    else add(HARD, 'roadmap.md', dropEmptySubsections(hard));
  }

  const lessons = readDoc(memDir, 'lessons.md');
  if (lessons !== null) add(LESSONS, 'lessons.md', getSection(lessons, 'Open'));

  if (deadEndCheck) {
    const history = readDoc(memDir, 'history.md');
    if (history !== null) add(DEAD_ENDS, 'history.md', getSection(history, 'Dead ends'));
  }
  return out;
}

function assemble(head, sections, notice) {
  const top = sections.some((s) => s.label === DEAD_ENDS) ? `${head}\n${DEAD_END_RULE}` : head;
  const parts = [top];
  for (const s of sections) parts.push(`${s.label}\n${s.text}`);
  if (notice) parts.push(notice);
  return parts.join('\n\n');
}

// The safety cap: shorten (then drop) sections in CUT_ORDER until it fits.
function fitToCap(head, sections, notice) {
  let out = assemble(head, sections, notice);
  while (out.length > MAX_CHARS) {
    const label = CUT_ORDER.find((l) => sections.some((s) => s.label === l));
    if (!label) break;
    const idx = sections.findIndex((s) => s.label === label);
    const target = sections[idx];
    const suffix = '\n' + TRUNC(target.file);
    const keep = target.text.length - (out.length - MAX_CHARS) - suffix.length;
    if (target.text.endsWith(suffix) || keep <= 0) sections.splice(idx, 1);
    else target.text = target.text.slice(0, keep).replace(/\s+$/, '') + suffix;
    out = assemble(head, sections, notice);
  }
  return out;
}

function buildContext({ memDir, sessionId, unprocessed, deadEndCheck }) {
  const head = [
    `Project memory is active (folder: ${memDir}, session ${sessionId}).`,
    `The plan and history live in ${memDir}: roadmap.md, history.md, research/ — read them when the user asks or when you need them.`,
  ].join('\n');
  const n = (unprocessed || []).length;
  const notice = n
    ? `${n} earlier session(s) weren't wrapped up — offer to fold them into this session's wrap-up.`
    : '';
  return fitToCap(head, collectSections(memDir, deadEndCheck === true), notice);
}

module.exports = { buildContext, MAX_CHARS };
