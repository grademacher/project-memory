'use strict';
const fs = require('node:fs');
const path = require('node:path');

const configPath = (memDir) => path.join(memDir, 'config.json');

// Returns the parsed config object, or {} when it is missing or invalid.
function readConfig(memDir) {
  try {
    const c = JSON.parse(fs.readFileSync(configPath(memDir), 'utf8'));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch {
    return {};
  }
}

// Off unless config.json says exactly true.
const deadEndCheckOn = (config) => config.deadEndCheck === true;

module.exports = { configPath, readConfig, deadEndCheckOn };
