---
description: Wrap up this session into the project's local memory docs (history, roadmap, lessons, sessions) after one short summary you approve.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(git log:*), Bash(git ls-files:*), Bash(node:*)
---

If the project-memory skill isn't already in context, load it first.

Wrap up this session into the project's memory. Follow the project-memory
skill's formats and hard rules (document formats, lesson lifecycle,
completed-item lifecycle, ground-rules check). This command adds only the
procedure and the summary layout.

## 1. Gather

First, run this with the Bash tool, exactly as written:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/session-log.js" show "${CLAUDE_PROJECT_DIR}" "${CLAUDE_SESSION_ID}"
```

If `${CLAUDE_PROJECT_DIR}` is empty or appears unexpanded, use the current
working directory instead, here and in step 5.

- If it prints `This project isn't tracked by project-memory.`, say so in one
  line, mention `/project-memory:setup-tracking`, and stop.
- `Memory folder:` is where the docs live. Read and write only there.
- If there are `Abandoned session` sections, ask the user in one line whether
  to fold them into this wrap-up, and wait for the answer. Ignore any they
  decline. Folded sessions count as one session for lesson streaks.
- Run `git log --since=<First event> --format="%h %ad %s" --date=iso` with this
  session's first event time (the earliest included session's, if you fold
  any in). If there's no activity log, use the start of today and work from
  the conversation and git alone. Skip git if the project isn't a git repo.
- The conversation itself is the main source; the log and git fill gaps.

## 2. Read the target docs

Read `history.md`, `roadmap.md`, `lessons.md` and `sessions.md` in the memory
folder, plus any `research/` or `reference/` docs a change touches. Never
propose something already recorded. Use `git ls-files` to check whether
CLAUDE.md or README is tracked before suggesting changes to them.

Then check the roadmap's shape (this never writes):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap.js" check "${CLAUDE_PROJECT_DIR}"
```

Its note lines (`active-section`, `legacy-working-agreements`,
`extra-sections: <a> | <b>`, `undated-verification-rows: <n>`) feed the
roadmap upkeep in step 3.

## 3. Draft (internally, nothing written yet)

- A Timeline entry for today, merged into today's heading if it exists.
- Roadmap changes:
  - Status moves: a Queue item work started on becomes
    `### <item name> (in progress)` at the top of the Queue; a finished item
    leaves the Queue and becomes a dated Awaiting verification row.
  - New items go to the bottom of the Queue, unless the user said otherwise.
    New parked items get their blockers.
  - An open question this session answered becomes a Timeline decision,
    and its bullet is removed. Never propose a new open question; add one
    only when the user asks.
- Roadmap upkeep, only real candidates, no filler:
  - Priority: `Move <X> above <Y>: <reason>` when this session showed an
    item is critical (it blocks other work, it's a regression, or the user
    called it urgent).
  - Duplicates: `Merge <X> into <Y>` when two items describe the same work;
    the merged item keeps both items' details.
  - Unpark: `Unpark <X>: <blocker> is resolved (<evidence>)`; it goes to the
    bottom of the Queue unless the user says otherwise.
  - Stale verification: for a dated Awaiting verification row older than 14
    days, `Still unverified since <date>: verify, keep or drop?`. At most two
    such lines.
  - Folds, from the step 2 notes, one line each:
    - `active-section`: fold Active into the top of the Queue, each item
      titled `(in progress)` with its text kept.
    - each `extra-sections` name: if it fits a roadmap section, propose
      folding it (a task list such as "Game update protocol" becomes a
      Queue item; a list of ideas becomes Queue items at the bottom, one
      each; a procedure goes to `reference/` under the normal rules).
      If it's truly distinct (reference material, a status map, an
      appendix), propose keeping it.
    - `legacy-working-agreements`: propose migrating the whole section in
      one line, all or nothing: each entry goes to Hard constraints (under
      Rules for Claude or Technical limits & requirements) or to
      `reference/` under the strict tests, and the `## Working agreements`
      heading is removed. Never migrate part of it: session start stops
      loading Working agreements once Hard constraints exists.
- New dead ends.
- Lessons: new ones (only the three loggable kinds), streak updates,
  retirements, structural-fix proposals.
- The ground-rules check (always): a new or changed rule for Claude or
  technical limit goes in the roadmap's Hard constraints only if it passes
  the skill's strict tests (an instruction addressed to Claude; a hard
  limit, or a toolchain, OS or runtime requirement). Stated in its current
  version only; how it changed goes in today's Timeline entry. Anything
  that fails the tests, or that you're unsure about, goes instead to
  `reference/procedures.md` (the user's own operating rules, procedures)
  or `reference/notes.md` (caveats, tips, security notes, other facts).
- Completed-item retirement, for verified items only.
- A research save, only if the session included a real deep dive (web
  research, a multi-file investigation, or comparing approaches); omit it
  otherwise. One item per topic: `research/YYYY-MM-DD-<topic>.md` with a
  one-line scope. Skip a topic an existing research doc already covers.
- One sessions.md line.

## 4. Present one short summary

Use this skeleton, about 15 lines at most (about 20 when roadmap upkeep is
proposed). Roadmap upkeep lines are numbered items under `**roadmap.md**`.
Number the items across docs.
Leave out docs with no changes; keep `Ground rules:` and `Session:` always.
Include `Tracked docs:` only when a tracked README or team doc went stale.

```
**<doc>**
1. <change>
2. <change>
**<doc>**
3. <change>
4. Research: save <topic> → research/YYYY-MM-DD-<topic>.md (<one-line scope>)   ← only when a deep dive is proposed
Tracked docs: <stale part → suggested text>
Ground rules: <no change | what changed, or the CLAUDE.md suggestion as text>
Session: <the sessions.md line>
Reply ok, or edit/skip by number.
```

Then stop and wait for the reply.

## 5. Write

- Apply what the user approved, with minimal edits, after re-reading each
  doc. Write only inside the memory folder. No commits, and no edits to
  tracked files. Write the sessions.md line even when everything else was
  skipped.
- For an approved research save, write the doc from the conversation:
  the question, what was found, the options compared and the conclusion,
  readable cold a month later, with its sources cited (URLs, file paths,
  commits). Never overwrite an existing file.
- For each fold or migration line that was approved as "keep", or
  declined, record the section's exact heading text so it isn't proposed
  again (skip sections that were folded away). This covers Active and
  Working agreements too. Always quote the name:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" "${CLAUDE_PROJECT_DIR}" roadmap-keep add "<section name>"
```

- Put the roadmap's sections back in order (this only moves whole sections
  and restores missing headers):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/roadmap.js" tidy "${CLAUDE_PROJECT_DIR}"
```

- Then mark the logs processed, listing exactly this session's id plus the
  abandoned ids that were folded in:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/session-log.js" done "${CLAUDE_PROJECT_DIR}" "${CLAUDE_SESSION_ID}" <folded ids...>
```

- Confirm in one line which docs were updated.
