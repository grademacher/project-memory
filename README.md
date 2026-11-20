# project-memory

A Claude Code plugin that keeps a long-running project's memory in plain
markdown inside the project: history, roadmap, lessons and a session log.
You don't have to start a session for it to work, and nothing it writes is
ever committed.

- **Automatic start:** each session loads the project's Hard constraints (the
  rules for Claude and the technical limits) plus a pointer to the roadmap
  and history. Claude reads those itself when it needs them.
- **Silent notes:** hooks log prompts, file edits and commits to a local
  per-session log. They make no model calls.
- **`/project-memory:wrap-up`** turns the session into history, roadmap,
  lessons and session-log updates. It shows one short summary and writes
  only after you approve. It can also save a real deep dive to `research/`.
- **`/project-memory:setup-tracking`** works on new or existing projects. On
  existing projects it reads your docs and git history, drafts a history
  and roadmap, and files loose docs into `research/`, `reference/` and
  `archive/`. You approve one plan first.
- **`/project-memory:dead-ends on|off`** is an optional checker. It flags
  when current work repeats a recorded dead end.

## Where things live

Everything goes in `.project-memory/` at the root of the main checkout,
shared by all worktrees:

```
.project-memory/
  history.md    roadmap.md    lessons.md    sessions.md    config.json
  research/     reference/    archive/      state/   (logs, not for reading)
```

The folder is hidden from git through `.git/info/exclude`, which is never
committed and never touches `.gitignore`. The plugin never commits and never
edits tracked files. The one exception is setup: with your approval it moves
git-tracked markdown docs that no code or tooling references. Git then shows
those as deletions for you to commit or restore.

## Install

Requirements: Claude Code, **Node.js 18+** (the hooks are Node scripts), and
git.

```
claude plugin marketplace add grademacher/project-memory
claude plugin install project-memory@org-project
```

Or, inside a Claude Code session:

```
/plugin marketplace add grademacher/project-memory
/plugin install project-memory@org-project
```

To update later: `claude plugin marketplace update org-project`.

> **Windows tip:** if PowerShell says "running scripts is disabled", call
> `claude.cmd` instead of `claude`.

## Development

```
npm test        # node:test suite for the hooks and scripts
claude plugin validate ./plugins/project-memory
```
