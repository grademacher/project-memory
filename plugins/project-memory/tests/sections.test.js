'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { getSection } = require('../lib/sections');

const doc = [
  '# Title', '', '## Active', 'active body', '', '## Queue', 'queue body', '# Other', 'other',
].join('\n');

test('heading match is case-insensitive', () => {
  assert.strictEqual(getSection(doc, '  aCtIvE '), 'active body');
});

test('stops at next ## heading', () => {
  assert.strictEqual(getSection(doc, 'Active').includes('queue'), false);
  assert.strictEqual(getSection(doc, 'Queue'), 'queue body');
});

test('missing heading returns null', () => {
  assert.strictEqual(getSection(doc, 'Nope'), null);
});

test('unknown sections are ignored', () => {
  const md = '## Weird\nstuff\n## Active\nreal';
  assert.strictEqual(getSection(md, 'Active'), 'real');
});

test('getSection strips HTML comments', () => {
  const md = '## Active\n<!-- guidance\nover two lines -->\n- real item <!-- inline -->\n## Queue\nq';
  assert.strictEqual(getSection(md, 'Active'), '- real item');
});

test('getSection: section with only a comment is empty', () => {
  assert.strictEqual(getSection('## Active\n<!-- One ### per item -->\n', 'Active'), '');
});

test('getSection: table header + separator only is empty', () => {
  const md = '## Open\n<!-- c -->\n| Lesson | Failure |\n| --- | --- |\n\n## Retired\n';
  assert.strictEqual(getSection(md, 'Open'), '');
  const filled = '## Open\n| Lesson | Failure |\n| --- | --- |\n| a | b |\n';
  assert.strictEqual(getSection(filled, 'Open'), '| Lesson | Failure |\n| --- | --- |\n| a | b |');
});
