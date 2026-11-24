'use strict';
// CLI used by /project-memory:dead-ends, /wrap-up and /setup-tracking:
//   node config.js <projectDir> dead-ends [on|off]
//     With no on/off, prints the current state. Otherwise updates config.json
//     (other keys are kept) and prints the new state.
//   node config.js <projectDir> roadmap-keep [add <section name...>]
//     With no add, lists the roadmap sections the user chose to keep.
//     Otherwise adds the name (case-insensitive, no duplicates).
const fs = require('node:fs');
const { resolveProject } = require('../lib/paths');
const { configPath, readConfig, deadEndCheckOn, roadmapKeep } = require('../lib/config');

const UNTRACKED = "This project isn't tracked by project-memory.";
const USAGE = 'usage: node config.js <projectDir> dead-ends [on|off] | roadmap-keep [add <name>]';
const state = (on) => `Dead-end checker: ${on ? 'on' : 'off'}`;

// A missing or unreadable config still gets its version back.
function writeConfig(memDir, config) {
  fs.writeFileSync(configPath(memDir), JSON.stringify({ version: 1, ...config }) + '\n');
}

function parseArgs(args) {
  const [projectDir, setting, ...rest] = args;
  if (!projectDir) throw new Error(USAGE);
  if (setting === 'dead-ends') {
    const v = rest[0] === undefined ? null : String(rest[0]).toLowerCase();
    if (rest.length > 1 || (v !== null && v !== 'on' && v !== 'off')) throw new Error(USAGE);
    return { projectDir, setting, value: v };
  }
  if (setting === 'roadmap-keep') {
    if (rest.length === 0) return { projectDir, setting, value: null };
    const name = rest.slice(1).join(' ').trim();
    if (rest[0] !== 'add' || !name) throw new Error(USAGE);
    return { projectDir, setting, value: name };
  }
  throw new Error(USAGE);
}

function main() {
  const { projectDir, setting, value } = parseArgs(process.argv.slice(2));
  const { memDir, tracked } = resolveProject(projectDir);
  if (!tracked) {
    process.stdout.write(UNTRACKED + '\n');
    return;
  }
  const config = readConfig(memDir);
  if (setting === 'dead-ends') {
    if (value === null) {
      process.stdout.write(state(deadEndCheckOn(config)) + '\n');
      return;
    }
    writeConfig(memDir, { ...config, deadEndCheck: value === 'on' });
    process.stdout.write(`${state(value === 'on')} (takes effect next session start)\n`);
    return;
  }
  const kept = roadmapKeep(config);
  if (value === null) {
    process.stdout.write(`Roadmap sections kept: ${kept.length ? kept.join(' | ') : 'none'}\n`);
    return;
  }
  if (!kept.some((k) => k.trim().toLowerCase() === value.toLowerCase())) {
    writeConfig(memDir, { ...config, roadmapKeep: [...kept, value] });
  }
  process.stdout.write(`Kept roadmap section: ${value}\n`);
}

try {
  main();
} catch (e) {
  process.stderr.write(`config: ${e.message}\n`);
  process.exit(1);
}
