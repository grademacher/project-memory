'use strict';
const { normalizeForCompare, relativeToRoot } = require('./paths');

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const COMMIT_RE = /\bgit\b[^|;&]*\bcommit\b/;
// The plugin's own scripts (run by its commands) are plumbing, not activity.
// Only `node <path>/<script>.js` matches (the path may be quoted and contain
// spaces), so a commit message that merely names a script is still logged.
// config.js is a common name, so it also needs its `dead-ends` argument.
const OWN_SCRIPT_RE =
  /\bnode\s+(?:"[^"]*|[^"\s]*)(?:(?:session-log|init-memory|move-docs)\.js|[\\/]config\.js"?\s.*\bdead-ends\b)/;

function insideDir(dir, file) {
  const d = normalizeForCompare(dir).replace(/\/+$/, '');
  const f = normalizeForCompare(file);
  return f === d || f.startsWith(d + '/');
}

function toEvent(input, mainRoot, memDir, now) {
  const ts = now.toISOString();
  switch (input && input.hook_event_name) {
    case 'UserPromptSubmit':
      return { ts, type: 'prompt', text: String(input.prompt || '').slice(0, 300) };
    case 'PreCompact':
      return { ts, type: 'compact', trigger: input.trigger };
    case 'SessionEnd':
      return { ts, type: 'end', reason: input.reason };
    case 'PostToolUse': {
      const tool = input.tool_name;
      const ti = input.tool_input || {};
      if (FILE_TOOLS.has(tool)) {
        const file = ti.file_path || ti.notebook_path;
        if (!file || insideDir(memDir, file)) return null;
        return { ts, type: 'tool', tool, files: [relativeToRoot(mainRoot, file)] };
      }
      if (tool === 'Bash') {
        const command = String(ti.command || '');
        if (OWN_SCRIPT_RE.test(command)) return null;
        return { ts, type: 'tool', tool, cmd: command.slice(0, 200), isCommit: COMMIT_RE.test(command) };
      }
      return null;
    }
    default:
      return null;
  }
}

module.exports = { toEvent };
