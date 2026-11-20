#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { readStdinJson, runSafely, pluginDataDir } = require('../lib/io');
const { resolveProject } = require('../lib/paths');
const { toEvent } = require('../lib/events');
const { appendEvent } = require('../lib/logs');

let errorLog = null;

runSafely(
  async () => {
    const input = await readStdinJson();
    // CLAUDE_PROJECT_DIR first: input.cwd follows Claude into nested repos.
    const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const project = resolveProject(start);
    if (!project.tracked) return;
    errorLog = path.join(project.memDir, 'state', 'errors.log');
    const event = toEvent(input, project.mainRoot, project.memDir, new Date());
    if (event) appendEvent(project.memDir, input.session_id, event);
  },
  () => errorLog || path.join(pluginDataDir(), 'errors.log')
);
