#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { readStdinJson, runSafely, pluginDataDir } = require('../lib/io');
const { resolveProject } = require('../lib/paths');
const { listUnprocessed, cleanupProcessed } = require('../lib/logs');
const { buildContext } = require('../lib/context');
const { readConfig, deadEndCheckOn } = require('../lib/config');
const { wasPrompted, markPrompted } = require('../lib/prompted');

const SETUP_PROMPT =
  "This project isn't tracked by project-memory. Mention once, briefly, that /project-memory:setup-tracking is available; don't bring it up again.";

let errorLog = null;

function emit(additionalContext) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } })
  );
}

runSafely(
  async () => {
    const input = await readStdinJson();
    // CLAUDE_PROJECT_DIR first: input.cwd follows Claude into nested repos.
    const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const project = resolveProject(start);
    const now = new Date();
    if (project.tracked) {
      errorLog = path.join(project.memDir, 'state', 'errors.log');
      cleanupProcessed(project.memDir, now);
      const unprocessed = listUnprocessed(project.memDir, input.session_id, now);
      const deadEndCheck = deadEndCheckOn(readConfig(project.memDir));
      emit(buildContext({ memDir: project.memDir, sessionId: input.session_id, unprocessed, deadEndCheck }));
      return;
    }
    if (!project.isGit) return;
    const dataDir = pluginDataDir();
    if (wasPrompted(dataDir, project.mainRoot)) return;
    emit(SETUP_PROMPT);
    markPrompted(dataDir, project.mainRoot, now);
  },
  () => errorLog || path.join(pluginDataDir(), 'errors.log')
);
