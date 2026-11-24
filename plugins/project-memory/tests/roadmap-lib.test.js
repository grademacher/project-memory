'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { tidyRoadmap, REQUIRED } = require('../lib/roadmap');

const TEMPLATE = [
  '# {{PROJECT}} — roadmap',
  '',
  '## Hard constraints',
  '<!-- hc guidance -->',
  '### Rules for Claude',
  '<!-- rules guidance -->',
  '### Technical limits & requirements',
  '<!-- tech guidance -->',
  '',
  '## Awaiting verification',
  '<!-- av guidance -->',
  '| Item | What to check | Added |',
  '| --- | --- | --- |',
  '',
  '## Queue',
  '<!-- queue guidance -->',
  '',
  '## Parked',
  '<!-- parked guidance -->',
  '| Item | Blocker |',
  '| --- | --- |',
  '',
  '## Open questions',
  '<!-- oq guidance -->',
  '',
].join('\n');

const headings = (text) => text.split(/\r?\n/).filter((l) => /^## /.test(l)).map((l) => l.slice(3).trim());
const tidy = (text, keep) => tidyRoadmap(text, TEMPLATE, keep);

const ORDERED = '# P — roadmap\n\n## Hard constraints\n### Rules for Claude\n- r\n### Technical limits & requirements\n- t\n\n' +
  '## Awaiting verification\na\n\n## Queue\nq\n\n## Parked\np\n\n## Open questions\no\n';

test('REQUIRED lists the five sections in order', () => {
  assert.deepStrictEqual(REQUIRED, ['Hard constraints', 'Awaiting verification', 'Queue', 'Parked', 'Open questions']);
});

test('orders sections and keeps the preamble', () => {
  const input = '# P — roadmap\n\n## Parked\np\n\n## Queue\nq\n\n## Hard constraints\n### Rules for Claude\n- r\n' +
    '### Technical limits & requirements\n- t\n\n## Awaiting verification\na\n\n## Open questions\no\n';
  const r = tidy(input);
  assert.deepStrictEqual(headings(r.text), REQUIRED);
  assert.ok(r.text.startsWith('# P — roadmap\n\n## Hard constraints'));
  assert.strictEqual(r.changed, true);
});

test('already tidy is unchanged and idempotent', () => {
  assert.strictEqual(tidy(ORDERED).changed, false);
  const once = tidy('## Queue\nq\n## Parked\np\n').text;
  const twice = tidy(once);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(twice.text, once);
});

test('restores missing sections from the template', () => {
  const r = tidy('# P\n');
  assert.deepStrictEqual(headings(r.text), REQUIRED);
  assert.ok(r.text.includes('| Item | Blocker |'));
  assert.ok(r.text.startsWith('# P\n\n## Hard constraints'));
});

test('restores missing sub-headers without moving bullets', () => {
  const r = tidy('## Hard constraints\n- old rule\n');
  const lines = r.text.split('\n');
  const rules = lines.indexOf('### Rules for Claude');
  const bullet = lines.indexOf('- old rule');
  const tech = lines.indexOf('### Technical limits & requirements');
  assert.ok(rules >= 0 && rules < bullet && bullet < tech, r.text);
  assert.strictEqual(r.text.split('- old rule').length, 2);
});

test('rules sub-header goes after a leading comment', () => {
  const r = tidy('## Hard constraints\n<!-- note -->\n### Technical limits & requirements\n- t\n');
  const lines = r.text.split('\n');
  assert.ok(lines.indexOf('<!-- note -->') < lines.indexOf('### Rules for Claude'));
  assert.ok(lines.indexOf('### Rules for Claude') < lines.indexOf('### Technical limits & requirements'));
});

test('user sections go last in original order', () => {
  const input = '## Appendix\nappendix body\n  indented\n\n## 9. Feature ideas\n- idea\n\n' + ORDERED.replace('# P — roadmap\n\n', '');
  const r = tidy(input);
  assert.deepStrictEqual(headings(r.text), [...REQUIRED, 'Appendix', '9. Feature ideas']);
  assert.ok(r.text.includes('## Appendix\nappendix body\n  indented\n\n## 9. Feature ideas\n- idea\n'));
  assert.deepStrictEqual(r.notes.extraSections, ['Appendix', '9. Feature ideas']);
});

test('keep list hides kept sections from extraSections', () => {
  const r = tidy('## Appendix\nx\n## 9. Feature ideas\ny\n', ['appendix']);
  assert.deepStrictEqual(r.notes.extraSections, ['9. Feature ideas']);
});

test('Active is reported, not listed', () => {
  const r = tidy('## Active\n### X\nbody\n');
  assert.strictEqual(r.notes.activeSection, true);
  assert.ok(!r.notes.extraSections.includes('Active'));
  assert.ok(r.text.includes('## Active\n### X\nbody\n'));
  assert.strictEqual(tidy(ORDERED).notes.activeSection, false);
});

test('legacy working agreements stays first and no Hard constraints added', () => {
  const r = tidy('## Queue\nq\n## Working agreements\n- be kind\n');
  assert.strictEqual(headings(r.text)[0], 'Working agreements');
  assert.ok(!r.text.includes('## Hard constraints'));
  assert.ok(!r.text.includes('### Rules for Claude'));
  assert.strictEqual(r.notes.legacyWorkingAgreements, true);
  assert.ok(!r.notes.extraSections.includes('Working agreements'));
  assert.deepStrictEqual(headings(r.text).slice(1), REQUIRED.slice(1));
});

test('working agreements next to Hard constraints is an ordinary extra section', () => {
  const r = tidy('## Working agreements\n- w\n' + ORDERED);
  assert.strictEqual(r.notes.legacyWorkingAgreements, false);
  assert.deepStrictEqual(r.notes.extraSections, ['Working agreements']);
});

test('CRLF preserved', () => {
  const crlf = ORDERED.replace(/\n/g, '\r\n');
  assert.strictEqual(tidy(crlf).changed, false);
  const r = tidy('## Queue\r\nq\r\n## Parked\r\np\r\n');
  assert.strictEqual(r.changed, true);
  assert.ok(!/[^\r]\n/.test(r.text), JSON.stringify(r.text));
});

test('headings inside fences are ignored', () => {
  const input = ORDERED.replace('## Queue\nq\n', '## Queue\n```\n## not a heading\n```\n~~~\n## also not\n~~~\n');
  const r = tidy(input);
  assert.ok(!r.notes.extraSections.includes('not a heading'));
  assert.deepStrictEqual(headings(r.text).filter((h) => REQUIRED.includes(h)), REQUIRED);
  const q = r.text.indexOf('## Queue');
  assert.ok(r.text.indexOf('## not a heading') > q && r.text.indexOf('## not a heading') < r.text.indexOf('## Parked'));
});

test('heading variants and duplicates merge', () => {
  const r = tidy('## queue  \nfirst\n\n## Parked\np\n\n## Queue\nsecond\n');
  const qs = r.text.split('\n').filter((l) => /^## queue/i.test(l));
  assert.deepStrictEqual(qs, ['## queue  ']);
  const start = r.text.indexOf('## queue');
  const end = r.text.indexOf('## Parked');
  const body = r.text.slice(start, end);
  assert.ok(body.indexOf('first') >= 0 && body.indexOf('first') < body.indexOf('second'), body);
});

test('undated verification rows', () => {
  const two = tidy('## Awaiting verification\n| Item | What to check |\n| --- | --- |\n| A | a |\n| B | b |\n');
  assert.strictEqual(two.notes.undatedVerificationRows, 2);
  const three = tidy('## Awaiting verification\n| Item | What to check | Added |\n| --- | --- | --- |\n| A | a | 2026-11-01 |\n| B | b |  |\n');
  assert.strictEqual(three.notes.undatedVerificationRows, 1);
  assert.strictEqual(tidy(ORDERED).notes.undatedVerificationRows, 0);
  assert.strictEqual(tidy('# P\n').notes.undatedVerificationRows, 0);
});

test('empty input gets all required sections', () => {
  const r = tidy('');
  assert.deepStrictEqual(headings(r.text), REQUIRED);
  assert.ok(r.text.endsWith('\n') && !r.text.endsWith('\n\n'));
});
