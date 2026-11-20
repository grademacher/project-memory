'use strict';
// CLI used by /project-memory:dead-ends:
//   node config.js <projectDir> dead-ends [on|off]
//     With no on/off, prints the current state. Otherwise updates config.json
//     (other keys are kept) and prints the new state.
const fs = require('node:fs');
const { resolveProject } = require('../lib/paths');
const { configPath, readConfig, deadEndCheckOn } = require('../lib/config');

const UNTRACKED = "This project isn't tracked by project-memory.";
const USAGE = 'usage: node config.js <projectDir> dead-ends [on|off]';
const state = (on) => `Dead-end checker: ${on ? 'on' : 'off'}`;

function main() {
  const [projectDir, setting, value, ...rest] = process.argv.slice(2);
  const v = value === undefined ? null : String(value).toLowerCase();
  if (!projectDir || setting !== 'dead-ends' || rest.length || (v !== null && v !== 'on' && v !== 'off')) {
    throw new Error(USAGE);
  }
  const { memDir, tracked } = resolveProject(projectDir);
  if (!tracked) {
    process.stdout.write(UNTRACKED + '\n');
    return;
  }
  const config = readConfig(memDir);
  if (v === null) {
    process.stdout.write(state(deadEndCheckOn(config)) + '\n');
    return;
  }
  // A missing or unreadable config still gets its version back.
  const next = { version: 1, ...config, deadEndCheck: v === 'on' };
  fs.writeFileSync(configPath(memDir), JSON.stringify(next) + '\n');
  process.stdout.write(`${state(next.deadEndCheck)} (takes effect next session start)\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`config: ${e.message}\n`);
  process.exit(1);
}
