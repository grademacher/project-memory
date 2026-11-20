'use strict';
// Remembers which projects already got the one-time setup prompt.
// Store: <dataDir>/prompted.json = { "<normalizeForCompare(root)>": "<ISO date>" }
const fs = require('node:fs');
const path = require('node:path');
const { normalizeForCompare } = require('./paths');

function storeFile(dataDir) {
  return path.join(dataDir, 'prompted.json');
}

function readStore(dataDir) {
  try {
    const obj = JSON.parse(fs.readFileSync(storeFile(dataDir), 'utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function wasPrompted(dataDir, mainRoot) {
  return Object.prototype.hasOwnProperty.call(readStore(dataDir), normalizeForCompare(mainRoot));
}

function markPrompted(dataDir, mainRoot, now) {
  const store = readStore(dataDir);
  store[normalizeForCompare(mainRoot)] = now.toISOString();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(storeFile(dataDir), JSON.stringify(store, null, 2) + '\n');
}

module.exports = { wasPrompted, markPrompted };
