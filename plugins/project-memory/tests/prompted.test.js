'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { wasPrompted, markPrompted } = require('../lib/prompted');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-prompted-'));
}

test('false before mark, true after', () => {
  const data = tmp();
  const root = path.join(tmp(), 'proj');
  assert.strictEqual(wasPrompted(data, root), false);
  markPrompted(data, root, new Date('2026-11-19T10:00:00Z'));
  assert.strictEqual(wasPrompted(data, root), true);
  assert.strictEqual(wasPrompted(data, path.join(tmp(), 'other')), false);
});

test('paths differing only in case/slashes are the same on win32', (t) => {
  if (process.platform !== 'win32') return t.skip('win32 only');
  const data = tmp();
  const root = path.join(tmp(), 'Proj');
  markPrompted(data, root, new Date());
  assert.strictEqual(wasPrompted(data, root.toUpperCase().split(path.sep).join('/')), true);
});
