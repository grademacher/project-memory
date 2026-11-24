'use strict';
// CLI used by /wrap-up and /setup-tracking:
//   node roadmap.js tidy  <projectDir>   puts roadmap.md into the fixed order
//   node roadmap.js check <projectDir>   reports the same, never writes
// First line: the result. Then, only when they apply, notes for Claude:
//   active-section | legacy-working-agreements | extra-sections: a | b |
//   undated-verification-rows: <n>
const fs = require('node:fs');
const path = require('node:path');
const { resolveProject } = require('../lib/paths');
const { readConfig, roadmapKeep } = require('../lib/config');
const { tidyRoadmap } = require('../lib/roadmap');

const UNTRACKED = "This project isn't tracked by project-memory.";
const USAGE = 'usage: node roadmap.js <tidy|check> <projectDir>';
const TEMPLATE = path.join(__dirname, '..', 'templates', 'roadmap.md');

function noteLines(notes) {
  const out = [];
  if (notes.activeSection) out.push('active-section');
  if (notes.legacyWorkingAgreements) out.push('legacy-working-agreements');
  if (notes.extraSections.length) out.push(`extra-sections: ${notes.extraSections.join(' | ')}`);
  if (notes.undatedVerificationRows > 0) out.push(`undated-verification-rows: ${notes.undatedVerificationRows}`);
  return out;
}

function main(verb, projectDir) {
  const { memDir, tracked } = resolveProject(projectDir);
  if (!tracked) return [UNTRACKED];
  const file = path.join(memDir, 'roadmap.md');
  if (!fs.existsSync(file)) return ['roadmap: no roadmap.md'];
  const text = fs.readFileSync(file, 'utf8');
  const result = tidyRoadmap(text, fs.readFileSync(TEMPLATE, 'utf8'), roadmapKeep(readConfig(memDir)));
  let first;
  if (verb === 'check') {
    first = result.changed ? 'roadmap: needs tidy' : 'roadmap: tidy';
  } else if (result.changed) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, result.text);
    fs.renameSync(tmp, file);
    first = 'roadmap: reordered';
  } else {
    first = 'roadmap: already tidy';
  }
  return [first, ...noteLines(result.notes)];
}

const [verb, projectDir, ...extra] = process.argv.slice(2);
if (!['tidy', 'check'].includes(verb) || !projectDir || extra.length) {
  process.stderr.write(USAGE + '\n');
  process.exit(1);
}
try {
  process.stdout.write(main(verb, projectDir).join('\n') + '\n');
} catch (e) {
  process.stderr.write(`roadmap: ${e.message}\n`);
}
