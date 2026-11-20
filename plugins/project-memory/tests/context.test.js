'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildContext } = require('../lib/context');

const DEAD = '- If the current approach matches an entry under Dead ends, say so in one line, citing the entry. Only flag clear matches.';
const POINTER = (m) => `The plan and history live in ${m}: roadmap.md, history.md, research/ — read them when the user asks or when you need them.`;

function docs(over = {}) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ctx-'));
  const files = {
    'history.md': '# History\n\n## What this project is\nA thing.\n\n## Dead ends\n- tried X, failed\n\n## Timeline\n- t1\n\n## Prior docs\n- p\n',
    'roadmap.md': '# Roadmap\n\n## Hard constraints\n### Rules for Claude\n- be nice\n### Technical limits & requirements\n- read-only\n\n## Active\n- doing A\n\n## Awaiting verification\n- check B\n\n## Queue\n- q1\n- q2\n\n## Parked\n- park\n',
    'lessons.md': '# Lessons\n\n## Open\n- lesson one\n\n## Retired\n- old\n\n## Candidates\n- cand\n',
    'sessions.md': '# Sessions\n\n- 2026-11-03 · build · s3 · docs: a\n- 2026-11-02 · build · s2 · docs: a\n',
    ...over,
  };
  for (const [f, c] of Object.entries(files)) if (c !== null) fs.writeFileSync(path.join(m, f), c);
  return m;
}
const build = (m, { unprocessed = [], deadEndCheck = false } = {}) =>
  buildContext({ memDir: m, sessionId: 'sess1', unprocessed, deadEndCheck });

test('default: header, pointer, Hard constraints and Open lessons, in order', () => {
  const m = docs();
  const out = build(m);
  assert.ok(out.startsWith(`Project memory is active (folder: ${m}, session sess1).`));
  const marks = [POINTER(m), '### Roadmap — Hard constraints', '### Rules for Claude', 'be nice',
    '### Technical limits & requirements', 'read-only', '### Lessons — Open', 'lesson one'];
  let last = -1;
  for (const k of marks) {
    const i = out.indexOf(k);
    assert.ok(i > last, `${k} out of order or missing`);
    last = i;
  }
});

test('no Active, Awaiting verification, Queue, Parked or Sessions text is injected', () => {
  const out = build(docs(), { deadEndCheck: true });
  for (const s of ['doing A', 'check B', 'q1', 'park', '· s3 ·', 'Active', 'Queue', 'Sessions']) {
    assert.ok(!out.includes(s), s);
  }
});

test('no research-offer or "don\'t mention" instructions', () => {
  const out = build(docs(), { deadEndCheck: true });
  assert.ok(!out.includes('offer once'));
  assert.ok(!out.includes("don't mention"));
});

test('deadEndCheck false (default): no Dead ends and no dead-end instruction', () => {
  const out = build(docs());
  assert.ok(!out.includes('tried X'));
  assert.ok(!out.includes('Dead ends'));
});

test('deadEndCheck true: Dead ends and the dead-end instruction', () => {
  const out = build(docs(), { deadEndCheck: true });
  assert.ok(out.includes(DEAD));
  assert.ok(out.includes('### History — Dead ends\n- tried X, failed'));
});

test('deadEndCheck true but no dead ends recorded: no instruction', () => {
  const out = build(docs({ 'history.md': '## Dead ends\n<!-- none yet -->\n' }), { deadEndCheck: true });
  assert.ok(!out.includes(DEAD));
});

test('empty Open lessons table is not injected', () => {
  const lessons = '## Open\n| Lesson (correct behavior) | Failure it prevents | Origin (date, context) | Clean streak | Relapses |\n| --- | --- | --- | --- | --- |\n\n## Retired\n';
  const out = build(docs({ 'lessons.md': lessons }));
  assert.ok(!out.includes('Lessons'));
  assert.ok(!out.includes('Lesson (correct behavior)'));
});

test('Open lessons table with rows is injected', () => {
  const lessons = '## Open\n| Lesson (correct behavior) | Failure it prevents | Origin (date, context) | Clean streak | Relapses |\n| --- | --- | --- | --- | --- |\n| run tests | regressions | 2026-11-01 | 0 | 0 |\n';
  const out = build(docs({ 'lessons.md': lessons }));
  assert.ok(out.includes('### Lessons — Open\n| Lesson (correct behavior)'));
  assert.ok(out.includes('| run tests |'));
});

test('missing roadmap.md: still returns header + pointer', () => {
  const m = docs({ 'roadmap.md': null });
  const out = build(m);
  assert.ok(out.includes('Project memory is active'));
  assert.ok(out.includes(POINTER(m)));
  assert.ok(out.includes('lesson one'));
});

test('unprocessed notice text with count', () => {
  const out = build(docs(), { unprocessed: ['a', 'b'] });
  assert.ok(out.includes("2 earlier session(s) weren't wrapped up — offer to fold them into this session's wrap-up."));
  assert.ok(!build(docs()).includes('earlier session'));
});

test('fresh template-based memDir injects only the header and pointer', () => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ctx-tpl-'));
  const tpl = path.join(__dirname, '..', 'templates');
  for (const f of ['history.md', 'roadmap.md', 'lessons.md', 'sessions.md']) {
    fs.writeFileSync(path.join(m, f), fs.readFileSync(path.join(tpl, f), 'utf8').split('{{PROJECT}}').join('Demo'));
  }
  const out = build(m, { deadEndCheck: true });
  assert.strictEqual(out, `Project memory is active (folder: ${m}, session sess1).\n${POINTER(m)}`);
});

test('over budget: Dead ends is cut first; Hard constraints, Lessons and notice survive', () => {
  const hard = Array.from({ length: 20 }, (_, i) => `- rule ${i} ${'h'.repeat(90)}`).join('\n');
  const dead = Array.from({ length: 200 }, (_, i) => `- dead end ${i} with some explanatory text padding it out`).join('\n');
  const m = docs({
    'roadmap.md': `## Hard constraints\n### Rules for Claude\n${hard}\n`,
    'history.md': `## Dead ends\n${dead}\n`,
  });
  const out = build(m, { unprocessed: ['x'], deadEndCheck: true });
  assert.ok(out.length <= 8000, String(out.length));
  assert.ok(out.includes(hard), 'Hard constraints must survive in full');
  assert.ok(out.includes('lesson one'));
  assert.ok(out.includes(DEAD));
  assert.ok(out.includes('… (truncated — read history.md)'));
  assert.ok(out.includes("1 earlier session(s) weren't wrapped up"));
});

test('huge Hard constraints: capped at 8000, header and notice kept', () => {
  const hard = `- ${'h'.repeat(12000)}`;
  const m = docs({ 'roadmap.md': `## Hard constraints\n${hard}\n` });
  const out = build(m, { unprocessed: ['x'], deadEndCheck: true });
  assert.ok(out.length <= 8000, String(out.length));
  assert.ok(out.startsWith('Project memory is active'));
  assert.ok(out.includes(POINTER(m)));
  assert.ok(out.includes("1 earlier session(s) weren't wrapped up"));
  assert.ok(out.includes('… (truncated — read roadmap.md)'));
  assert.ok(!out.includes('tried X'), 'Dead ends go before Hard constraints are cut');
});

test('legacy roadmap: Working agreements injected when there is no Hard constraints section', () => {
  const out = build(docs({ 'roadmap.md': '## Working agreements\n- be kind\n\n## Active\n- doing A\n' }));
  assert.ok(out.includes('### Roadmap — Working agreements\n- be kind'), out);
  assert.ok(!out.includes('Hard constraints'));
  assert.ok(!out.includes('doing A'));
});

test('Hard constraints win over a leftover Working agreements section', () => {
  const out = build(docs({
    'roadmap.md': '## Hard constraints\n### Rules for Claude\n- be nice\n\n## Working agreements\n- old agreement\n',
  }));
  assert.ok(out.includes('### Roadmap — Hard constraints\n### Rules for Claude\n- be nice'), out);
  assert.ok(!out.includes('old agreement'));
});

test('Hard constraints: empty subsections are left out', () => {
  const out = build(docs({
    'roadmap.md': '## Hard constraints\n### Rules for Claude\n<!-- guidance -->\n### Technical limits & requirements\n- Windows only\n\n## Active\n- doing A\n',
  }));
  assert.ok(out.includes('### Roadmap — Hard constraints\n### Technical limits & requirements\n- Windows only'), out);
  assert.ok(!out.includes('Rules for Claude'));
});
