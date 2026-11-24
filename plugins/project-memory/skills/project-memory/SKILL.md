---
name: project-memory
description: Use when working in a project that has a .project-memory/ folder (history, roadmap, lessons, sessions docs), when reading or writing those docs and their formats, when wrapping up a session, or when asked about setting up project tracking.
---

# Project memory

A project's memory lives in local Markdown files that git never sees. They
carry the narrative, plans, lessons and session log from one session to the
next. Hooks log activity and inject a short context at session start (Hard
constraints, open lessons, and Dead ends only when the dead-end checker is
on); docs are written only during wrap-up and setup.

## Where files live, and staying invisible to git

One folder at the root of the **main checkout**, even when working in a git
worktree (every worktree shares it):

```
.project-memory/
  config.json   history.md   roadmap.md   lessons.md   sessions.md
  research/     dated deep dives: YYYY-MM-DD-<topic>.md
  reference/    still-current reference material (cheat sheets, procedures)
  archive/      superseded docs (old status reports, stale plans)
  state/        machine state (activity logs, errors.log); not for reading
```

The folder is hidden by a `/.project-memory/` line in `.git/info/exclude`
(the per-clone ignore file). Nothing about it may change `git status`:

- Never commit. Never edit tracked files (that includes `.gitignore`,
  README, CLAUDE.md and team docs), and create no files outside the memory
  folder (except the user's global `~/.claude/CLAUDE.md` when they
  approve).
- Never move tracked files. The one exception: `/project-memory:setup-tracking`
  may move tracked markdown docs that code and tooling don't use, after the
  user approves its plan; git then shows them as deleted, and committing or
  restoring is the user's call. Tracked non-markdown files never move.
- When a tracked file (CLAUDE.md, README) needs a change, give the suggested
  edit as text for the user to apply.
- Within the project, write only inside the memory folder. Use its absolute
  path, as named in the session context (`folder: ...`) or printed by the
  plugin's scripts, never a relative `.project-memory/` path: from a
  worktree, that would land in the worktree, not the main checkout.

## Document formats

Section headings are fixed: the session-start hook finds sections by heading
text. Never rename, reorder or remove them; leave headings you don't
recognize alone.

**history.md**: title `# <Project> — project history`, then a one-paragraph
pointer to the roadmap, research and CHANGELOG.
- `## What this project is`: a description only (what it is, how it's
  built). No goals or plans.
- `## Dead ends`: one line each, so the whole list can be loaded when the
  dead-end checker is on:
  `- **<what was tried>** — <why it failed>. (YYYY-MM-DD, see Timeline)`, or
  `(YYYY-MM-DD, source: <path>)` when it came from a doc rather than a
  Timeline entry.
- `## Timeline`: `### YYYY-MM-DD — <headline>` with bullets for decisions,
  shipped features (how verified, commit hashes), fixes and findings. One
  heading per day; add to today's heading if it exists. Newest first unless
  the doc already uses another order.
- `## Prior docs`: index of archived or moved files, what each covered, and
  where it went.

**roadmap.md**: title `# <Project> — roadmap`.
- `## Hard constraints`, loaded every session, with two subsections:
  - `### Rules for Claude`: only instructions addressed to you (or an AI
    assistant): from CLAUDE.md, CLAUDE.local.md, AGENTS.md-style files, a
    "Working agreements" section in docs written for the assistant, or
    rules the user states in conversation. The user's own operating rules
    (account handling, cleanup steps, release chores) are not rules for
    Claude.
  - `### Technical limits & requirements`: only hard limits that break
    something or violate the project's nature if ignored (for example
    "read-only against the production database", "only one sync job may run at a time"), plus
    toolchain, OS and runtime requirements.
- `## Awaiting verification`: table `| Item | What to check | Added |`
  (Added is YYYY-MM-DD). When you add a dated row to an older two-column
  table, first add the `Added` header cell, and an empty cell to each
  existing row.
- `## Queue`: highest priority first, `### <item name>` items (or table
  rows, if the Queue already uses them) with goal, current state and next
  step. The item being worked on is titled `### <item name> (in progress)`
  and sits at the top. New items go at the bottom unless the user says
  otherwise.
- `## Parked`: table `| Item | Blocker |`.
- `## Open questions`: bullets `- <question> (added YYYY-MM-DD)`. Add one
  only when the user asks. When one is answered, the answer becomes a
  Timeline decision and the bullet is removed.

The sections always come in this order. There is no `## Active` section
(an old one folds into the top of the Queue) and no project description
(that lives in history). The user's own distinct sections go after Open
questions, unchanged; the ones the user chose to keep are listed in
config.json `roadmapKeep`. A legacy `## Working agreements` section that
stands in for Hard constraints stays until the user approves migrating it.
Wrap-up and setup put the sections in order with `scripts/roadmap.js`.

Items are referred to by name, without IDs. No struck-through or ✅ rows:
done items leave the roadmap (see the completed-item lifecycle below).

Hard constraints is the one home for rules, and a handful of entries is
normal. **When unsure, leave it out** and file it in `reference/` with its
source. State each entry in its **current** version only; how a rule
changed goes in the Timeline. Everything else goes where it belongs, never
dropped:
- the user's own operating rules, build or deploy procedures, doc-pipeline
  or tooling conventions → `reference/procedures.md` or another
  `reference/` doc;
- caveats, tips, test-environment advice, security notes, build packaging
  and deploy facts → `reference/` (the doc for their source, or
  `reference/notes.md`);
- design or architecture decisions (such as "the render loop never makes network
  calls") → a Timeline decision;
- customer- or person-specific procedures → `reference/` or a note on the
  related roadmap item;
- a code fact about one bug → the Timeline or the related roadmap item.

**lessons.md**: title `# Lessons — how we work`.
- `## Open`: `| Lesson (correct behavior) | Failure it prevents | Origin (date, context) | Clean streak | Relapses |`
- `## Retired`: `| Lesson | Retired on |`
- `## Candidates`: your own suggestions; not active until the user adopts one.

**sessions.md**: newest first, one line per session, even when nothing came
of it: `- YYYY-MM-DD · <type> · <one-line summary> · docs: <touched or "none">`.
Types: build, fix, research, planning, review, setup.

**Readable cold a month later.** Write for someone with no context: full
terms, no bare codes or abbreviations, and mark any label you invented as
yours (for example "(Claude's label)").

## Lesson lifecycle

- Log only three things: the user's explicit corrections, rules the user
  declares ("from now on…"), and repeats of a known failure. Your own ideas
  go to Candidates.
- A session is **clean** for a lesson only if the situation it covers came up
  and was handled correctly. Sessions where it never came up leave the streak
  unchanged. Abandoned sessions folded into one wrap-up count as one session.
- A relapse resets the clean streak to 0 and adds 1 to Relapses.
- **3 clean sessions in a row → retire it** (move to Retired with the date).
- **2 relapses → propose a structural fix** instead of a louder lesson: a
  bullet under Hard constraints → Rules for Claude, a rule in the user's
  global `~/.claude/CLAUDE.md`, or a suggested line for the project's
  CLAUDE.md, given as text.
- If a lesson sounds general rather than project-specific, offer to copy it
  to the user's global `~/.claude/CLAUDE.md`. Project-level is the default.

## In-session behavior

- **Silent by default.** Don't mention the tracking system, make no offers,
  and don't edit the memory docs mid-session unless the user asks; wrap-up
  does that.
- **Read on demand.** Only Hard constraints and open lessons are loaded.
  Read `roadmap.md`, `history.md` or `research/` in the memory folder when
  the user asks, or when you need the plan or past decisions.
- **Dead ends, only when the checker is on** (Dead ends then appear in the
  session context): if the current approach clearly matches an entry, say
  so in one line, citing the entry. Only flag clear matches. The checker is
  off by default; `/project-memory:dead-ends on|off` toggles it, from the
  next session start or `/compact`.
- **Generated docs and notes always go in the memory folder** (checklists,
  write-ups, notes: `reference/` or `research/`, as fits). If a CLAUDE.md
  or CLAUDE.local.md rule names another folder, still use the memory
  folder, don't edit that rule mid-session, and mention the conflict once
  (setup adopts untracked rules; for a tracked file it suggests the edit
  as text).
- **Research is never offered mid-session.** Wrap-up proposes saving a real
  deep dive (web research, a multi-file investigation, or comparing
  approaches) to `research/YYYY-MM-DD-<topic>.md`.

## Completed-item lifecycle (at wrap-up)

An item is **verified** only when its stated check passed in this session or
the user confirmed it. Never assume. For each verified item, propose
retiring it, in this order:

1. Write a history Timeline entry: what shipped, the key decisions, how it was
   verified, and the commit hashes.
2. Only after step 1 is written, remove the item from the roadmap entirely.
3. Turn leftovers (known issues, deferred polish, parked sub-parts) into new
   roadmap items.
4. Put `> Status: implemented YYYY-MM-DD — see history.` at the top of related
   research docs. They stay in `research/`.
5. If the feature changed how something is used (a flag, mode or setting),
   update docs in the memory folder's `reference/` directly. For tracked files
   (README, team docs), name the stale part in the summary for the user to fix.
6. Record dead ends and lessons hit along the way through the normal path.

Every wrap-up also runs a ground-rules check: did this session change the
roadmap's Hard constraints (a new or changed rule for Claude, or a new
technical limit or requirement that passes the tests above), or make
CLAUDE.md out of date? Edit Hard constraints directly, current version
only, and put the change itself in the Timeline. Suggest a CLAUDE.md
change as text if git tracks it. Answer in one line, even when it's "no
change."

## Hard rules

- **Read before writing.** Re-read the target doc right before editing it,
  and never propose something already recorded.
- **Minimal edits.** Change only the lines that need it; never rewrite a
  whole doc.
- **Never close what the user left open.** Items, questions and lessons stay
  open until the user, or a passed check, closes them.
- **Never rename the user's concepts.** Use their names for items, features
  and sections.
- **Be brief.** Wrap-up summaries target about 15 lines or fewer, grouped by
  doc, with empty categories left out. A long summary is a failed summary.
