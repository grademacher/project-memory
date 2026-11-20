'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function readStdinJson() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return reject(new Error('empty stdin'));
      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function pluginDataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'project-memory');
}

// Runs fn; never throws, never exits non-zero. Failures go to the error log.
async function runSafely(fn, errorLogPath) {
  try {
    await fn();
  } catch (err) {
    try {
      const file = (errorLogPath && errorLogPath()) || path.join(pluginDataDir(), 'errors.log');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const stack = err && err.stack ? err.stack : String(err);
      fs.appendFileSync(file, `${new Date().toISOString()} ${stack}\n`);
    } catch {
      /* nothing more we can do */
    }
  }
  process.exitCode = 0;
}

module.exports = { readStdinJson, runSafely, pluginDataDir };
