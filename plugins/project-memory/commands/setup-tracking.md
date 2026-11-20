---
description: Set up project-memory for this project — interview a new project, or inventory, classify and file an existing project's docs after one plan you approve.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, Bash(git:*), Bash(node:*)
---

If the project-memory skill isn't already in context, load it first.

Set up this project's memory. Follow the project-memory skill's formats and
hard rules (where files live, document formats, readable cold). This command
adds only the setup procedure.

**Ground rules for setup.** The only change git may see is deletions of
tracked markdown docs moved by the approved plan:
- Never commit, and never create or edit a tracked file. Tracked files
  move only if they are markdown docs (`.md`, `.markdown`) that pass the
  eligibility check (4.1) and the user approved the plan. Tracked
  non-markdown files never move.
- Move files only with the plugin's move-docs script (step 4.5), never
  with `git mv` or `mv`. Never delete a doc.
- Write only inside the memory folder: the absolute `memDir` that
  init-memory prints (`<root>/.project-memory`, where `<root>` is the main
  checkout found in step 1, never the worktree). Never touch `.gitignore`.
  The one exception: the approved line edits of an untracked doc-folder
  rule file (4.5).
- In an existing project, nothing is created, moved or written until the
  user approves the plan.

## 1. Locate the project

The project directory is `${CLAUDE_PROJECT_DIR}`. If that is empty or
appears unexpanded, use the current working directory instead, here and
below. Find the main checkout (the memory folder lives there, even when this
is a worktree):

```
git -C "${CLAUDE_PROJECT_DIR}" rev-parse --path-format=absolute --git-common-dir
```

- If it prints a path ending in `.git`, its parent directory is the root.
- If it prints some other path (a submodule), the root is the output of
  `git -C "${CLAUDE_PROJECT_DIR}" rev-parse --show-toplevel`.
- If it fails, this isn't a git repo: the root is `${CLAUDE_PROJECT_DIR}`.

If `<root>/.project-memory/config.json` exists, say in one line that this
project is already tracked, mention `/project-memory:wrap-up`, and stop.

## 2. Pick the mode

**Inventory** the docs under the root with Glob:
`**/*.{md,markdown,txt,rst}`. Leave out:
- `.git/`, `node_modules/`, `.project-memory/`, `.superpowers/`;
- tool config folders: `.github/`, `.claude/`, `.cursor/`, `.vscode/`,
  `.idea/`, `.worktrees/` (their files configure tools and must stay put);
- any folder below the root that has its own `.git` file or folder (a
  nested repo, submodule or worktree). Find them with Glob `**/.git` and
  leave out everything under each one's parent folder;
- build output (`build/`, `dist/`, `out/`, `target/`);
- vendored and third-party code (`vendor/`, `third_party/`, `external/`,
  virtualenvs), and test fixtures;
- license files (LICENSE, COPYING, NOTICE) and `.txt` files that are config
  or data, not docs (`requirements.txt`, `CMakeLists.txt`, `robots.txt`).

Count commits with `git -C "<root>" rev-list --count HEAD` (0 if it fails
or this isn't a git repo).

The project is **existing** if the inventory has at least one doc besides
README, CHANGELOG and CLAUDE.md, or it has 10 or more commits. Otherwise it
is **new**.

## 3. New project

1. If this isn't a git repo, ask in one line whether to run `git init`
   (their choice; setup still commits nothing). If yes, run
   `git -C "<root>" init`.
2. Ask three short questions in one message, then wait for the answers:
   1. What is this project (and what is it called)?
   2. What are its goals?
   3. Any rules I must always follow here, and any technical limits or
      requirements (for example read-only access, toolchain, OS, runtime)?
      "None yet" is fine.
3. Save a baseline: `git -C "<root>" -c core.quotepath=off status --porcelain` (git repos only).
   Then create the memory folder, passing the name if the user gave one:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init-memory.js" "<root>" --name "<Project name>"
   ```

   It prints JSON with `memDir`. If it fails, show its error and stop:
   nothing was created.
4. Fill in, replacing only the placeholder comments:
   - `<memDir>/history.md` `## What this project is`: a short description
     from answer 1 only, with no goals.
   - `<memDir>/roadmap.md` `## Queue`: one `###` item per goal from
     answer 2, in the user's words.
   - `<memDir>/roadmap.md` `## Hard constraints`: answer 3, one bullet
     each, rules for Claude under `### Rules for Claude` and limits or
     requirements under `### Technical limits & requirements`, applying
     the skill's strict tests. Anything that fails them goes, in the user's
     words, to `<memDir>/reference/procedures.md` (the user's own
     operating rules, procedures) or `<memDir>/reference/notes.md`
     (caveats, tips, other notes).
5. Add the sessions.md line: `- <today> · setup · Set up project memory ·
   docs: history, roadmap`.
6. Finish with section 5, "Check and report".

## 4. Existing project

### 4.1 Inventory

- Get the tracked flag for every inventory file from
  `git -C "<root>" -c core.quotepath=off ls-files -- ":(icase)*.md" ":(icase)*.markdown" ":(icase)*.txt" ":(icase)*.rst"`
  (`core.quotepath=off` prints non-ASCII names as-is, so they match the
  Glob paths). Outside git, every file is untracked.
- Pick out the project's existing **history** and **roadmap** docs, if any
  (at most one of each; ask if it's ambiguous). You convert those yourself
  in 4.3, so they don't go to the classifier.
- Nested READMEs are **keep** without classification. Root README,
  CLAUDE.md, CLAUDE.local.md and AGENTS.md do go to the classifier, for
  what they say about the project (including rules they give Claude).
- **Tracked-doc eligibility.** A tracked markdown doc (`.md`, `.markdown`)
  may move unless the code or tooling uses it. It **stays** if any of
  these is true:
  - it's a keep file: README, CHANGELOG, CLAUDE.md, CLAUDE.local.md,
    AGENTS.md, LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, or another
    root file tools expect;
  - a non-markdown tracked file mentions its file name, or its path
    relative to the root without the extension (`docs/plan` for
    `docs/plan.md`). Check each remaining candidate (one call each):
    `git -C "<root>" grep -l -F -e "<file name>" -e "<path without extension>" -- . ":(exclude,icase)*.md" ":(exclude,icase)*.markdown"`.
    Any output means it stays (note which file mentions it); exit 1 with
    no output means no mention; any other failure means it stays;
  - it sits in a docs-site source folder: find site configs with Glob
    (`**/mkdocs.yml`, `**/docusaurus.config.*`, `**/conf.py` that imports
    sphinx, `**/book.toml`, `**/_config.yml`, `**/.vitepress/`, and the
    like); their source folders (mkdocs `docs_dir`, default `docs/`;
    docusaurus `docs/` and `blog/`; the folder holding sphinx's `conf.py`;
    and so on) stay whole. When unsure, it stays.

  Tracked non-markdown files (configs, images, scripts, `.txt`, data)
  always stay. Files that stay are indexed only.
- If more than about 60 docs remain, show the counts per folder and ask
  which folders to include before going on.

### 4.2 Understand (subagents)

Dispatch these in parallel, in one message, so the docs never fill your own
context:

- **Classifiers:** one `doc-classifier` subagent per batch of about 8
  files. The Agent tool may list it as `project-memory:doc-classifier` or
  `doc-classifier`; either is fine. Give each the root and its batch, one
  line per file: `<path relative to root> (tracked: yes|no)`.
- **Git milestones** (git repos with commits only): one general-purpose
  subagent, told to stay read-only, run
  `git -C "<root>" log --reverse --format="%h %as %s"`, read the whole log,
  and return dated milestones: `YYYY-MM-DD — <headline>` with one to three
  bullets and the key commit hashes. For long histories, group by week or
  month.

For any research file named `undated-<topic>.md`, take the date from the
file's modified time:
`node -e "console.log(require('fs').statSync(process.argv[1]).mtime.toISOString().slice(0,10))" "<file>"`.

### 4.3 Draft history and roadmap (in context, nothing written)

Read the existing history and roadmap docs fully, then convert them. If
there are none, start from the skill's format. Converting only **adds or
relabels** sections; it never deletes, merges or rewrites the user's
sections or text. The only content that moves: done (✅ or struck-through)
rows go to history, scattered Parked items go to `## Parked` with a
pointer left behind, and rules and constraints are sorted as below.

- Put the required headings first, in the skill's order. A section that
  fits one gets relabeled to it, with its original heading kept as an
  italic line under the new one. If several sections fit one heading,
  relabel only the best fit.
- **Rules and constraints.** Existing working agreements, hard
  constraints (wherever they sit, including bolded lists inside "What this
  project is"), and rules in CLAUDE.md / CLAUDE.local.md are sorted by the
  skill's Hard constraints definition and its strict tests: a rule for
  Claude must be addressed to Claude or an AI assistant; a limit must
  break something or violate the project's nature if ignored, or be a
  toolchain, OS or runtime requirement. When unsure, leave it out. A
  handful of entries is normal. Only items that qualify go into the
  roadmap's `## Hard constraints`, under `### Rules for Claude` or
  `### Technical limits & requirements`, each in its current form only
  (a past change, such as "relaxed on <date>", becomes a dated Timeline
  decision). Items that don't qualify are **never dropped**; they move,
  with their source, to: a Timeline decision (design or architecture
  choices), `<memDir>/reference/procedures.md` (the user's own operating
  rules; build, deploy, tooling and customer-specific procedures),
  `<memDir>/reference/notes.md` (caveats, tips, test-environment advice,
  security notes, build packaging and deploy facts), or a note on the
  related roadmap item.
  A roadmap section that held them is relabeled `## Hard constraints`
  (original heading as the italic line). A section elsewhere that is empty
  once its items have moved (such as history's old Hard constraints) is
  left out, and the plan says where its items went.
- **Doc-folder rule.** If a classifier returned a `doc-folder-rule`,
  `.project-memory/` becomes the single home for generated docs and notes.
  Rules for Claude gets the rule in its current form, `Generated docs and
  notes go in <memDir>.` (the absolute `<root>/.project-memory`), and the
  old wording becomes a dated Timeline decision. Other assistant
  instructions on the same line arrive as separate `rule` items (already
  pointing at the memory folder) and go into Rules for Claude too.
  Docs in that folder are classified and moved like any other doc
  (tracked ones only if they pass the eligibility check).
- "What this project is" is a description only. Never invent goals for
  it; goals the docs state go to the roadmap as items.
- Add `## Dead ends`, with one line per dead end found in the Timeline
  (the Timeline itself stays as is).
- Rows marked ✅ or struck through leave the roadmap and become Timeline
  bullets under their date.
- Parked items scattered through other sections move into `## Parked`,
  with a one-line pointer left where they were.
- Sections that fit no required heading (for example "Maintenance and tech
  debt", "Optimization backlog", "Current verified memory map", an
  appendix) **stay under their own headings, in their original order**,
  after the required sections.
- Keep the Timeline's existing date order; new entries follow it.

Then fold in what the subagents returned, skipping anything already
recorded:
- `rule` items go to `### Rules for Claude`, `limit` items to
  `### Technical limits & requirements`, both under the roadmap's
  `## Hard constraints`, if they qualify; otherwise sort them as above.
- `procedure` items: nothing to do if their source doc is filed as
  reference, or is a keep file that stays in place (CLAUDE.md,
  CLAUDE.local.md, README): the procedure is already in the user's own
  file, so cite that file where relevant instead. Otherwise they go, with their source, into
  `<memDir>/reference/procedures.md` (one `##` per topic), or onto the
  related roadmap item when they belong to one customer's open work.
- `reference-note` items: the same, except that they go into
  `<memDir>/reference/notes.md` (one `##` per topic).
- `dead-end` items go to Dead ends, ending `(YYYY-MM-DD, source: <path>)`
  instead of "see Timeline"; `decision` and `shipped` items go to
  the Timeline under their date; git milestones fill dates the Timeline
  doesn't cover.
- `open-item` items go to the roadmap: Active if the source says work is
  in progress, otherwise Queue. Never close anything.
- Every extracted line ends with its source: `(source: <path>)`, using
  the doc's path after setup.

Draft `## Prior docs` as a table, one row per inventory file except keep
files:
`| Doc | Class | Now at | What it covered |`.

### 4.4 Plan table, then wait

Show one row per inventory file (history and roadmap docs included, class
`converted`):

```
| Path | Tracked | Destination | Class | Why | Extracted |
```

- **Destination:** research, reference and superseded files move to
  `.project-memory/research/<suggested name>`, `reference/` or
  `archive/` if they're untracked, or tracked markdown that passed the
  eligibility check. Show a tracked move as `<destination> — moves
  (tracked — git will show it as deleted; commit or restore is yours)`.
  Keep files and every other tracked file show `stays (indexed)`, with
  the reason in Why (keep file, mentioned in `<file>`, docs-site folder,
  not markdown). A history or roadmap doc moves to
  `archive/<name>-pre-setup.md` after conversion if it may move by the
  same rules; otherwise it stays.
- **Extracted:** the item count.
- Make sure no two destinations collide.
- Nested READMEs share one row:
  `<N> code-adjacent docs | | stays | keep | | 0`.

Under the table:
- An outline of the drafted history.md and roadmap.md: each heading with
  its item count, and which of the user's own sections are kept. Show Hard
  constraints as two counts (rules for Claude / technical limits), then
  list what was excluded, one short line per item:
  `<short name> → <Timeline | reference/procedures.md | reference/notes.md | roadmap item note>`.
- If there is a doc-folder rule, say so explicitly: "Your <file> says
  generated notes go in <folder>; setup will make .project-memory/ the
  single home: move the notes from <folder> that may move, record the rule as
  'Generated docs and notes go in <memDir>', and update these lines in
  <file>: <each line the classifier reported, quoted, with the new text
  it becomes>." The lines are the rule line and its directly related
  lines in the same section (such as notes on excluding that folder from
  git or not staging its files) that refer to the old folder; only the
  folder path changes on them. If git tracks <file>, end with "and suggest
  the edits to those lines as text" instead of "and update these lines in
  <file>".
- One line: tracked markdown docs marked "moves" are plain file moves, so
  git will show them as deleted; committing or restoring that is up to
  you. Switch any row to "stays" to keep it in place. Tracked
  non-markdown files never move.
- `Reply ok, or change any row (class, destination, stays, skip).`

Then stop and wait for approval. Apply the user's changes to the plan.
If the user asks to move a tracked markdown doc that the eligibility check
kept, you may, after saying in one line why it was kept; a tracked
non-markdown file never moves, whatever the request.

### 4.5 Apply the approved plan

1. Save a baseline: `git -C "<root>" -c core.quotepath=off status --porcelain` (git repos only).
2. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/init-memory.js" "<root>" --name "<Project name>"`,
   with the name from the existing history title or the folder name. If it
   fails, show its error and stop: nothing was created or moved.
3. Move the approved files. With the Write tool, write the plan to
   `<memDir>/state/move-plan.json`, one entry per file that moves:
   `[{"from":"<path relative to root>","to":"<path relative to memDir>","tracked":false}]`.
   Set `tracked` to true for each approved tracked markdown move. Then run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/move-docs.js" "<root>" "<memDir>/state/move-plan.json"
   ```

   It prints one JSON row per entry with a `status`: `moved`,
   `moved-tracked` (a tracked markdown doc; git now shows it deleted),
   `skipped-tracked`, `skipped-nested-repo`, `skipped-exists` or `error`
   (with a `reason`). The script owns the safety checks: it never
   overwrites, never moves nested-repo files or tracked non-markdown
   files, and moves a tracked markdown doc only when its row says
   `tracked`. Report every row that wasn't moved, with its status. Any
   file not moved stays at its old path: fix its plan row and its
   `Prior docs` row to say so.
4. Update links **inside `<memDir>` only**: in files there, fix every
   relative link or path that points to a moved file, or that broke because
   its own file moved, so it resolves again.
5. Find links in tracked files that point to moved files (Grep for the old
   paths and file names). **Report them; never edit them.**
6. Write history.md and roadmap.md from the approved drafts, including the
   `Prior docs` table. Re-read each first: init-memory only wrote templates.
   Write `reference/procedures.md` and `reference/notes.md` too if the
   draft has them (never overwrite an existing file; add to it instead).
7. Doc-folder rule, if the plan adopted one. If git doesn't track the
   rule's file, re-read it and Edit each line the plan listed (the rule
   line and its related lines): replace every mention of the old folder on
   it with `<memDir>`; nothing else on those lines changes, and no other
   line is touched. If git tracks the file, never edit it: put the
   suggested lines in the report as text.
8. Add the sessions.md line: `- <today> · setup · Set up project memory
   from <N> existing docs · docs: history, roadmap`.

## 5. Check and report

Run `git -C "<root>" -c core.quotepath=off status --porcelain` and show
the output. Compare it with the baseline: the new or changed lines must be
exactly one ` D <path>` per `moved-tracked` file, and nothing else. A doc
that already had local changes in the baseline may show another code (such
as `MD` or `AD`); that is fine when the path is a `moved-tracked` file.
If anything else appears (or a `moved-tracked` path is missing), say so
loudly and name the file. Outside git, skip this.

Then report briefly: the memory folder path, how many files moved where,
the `moved-tracked` files as the git deletions for the user to commit or
restore, the docs written, the doc-folder rule lines you updated or their
suggested text (if there was one), and any links in tracked files the user
may want to update (`file: old path → new path`).

Last step, in both modes and after the git status check: mark this setup
session as wrapped up, so the next session doesn't report it as unfinished.
Run this with the Bash tool, exactly as written (with `<root>` filled in):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/session-log.js" done "<root>" "${CLAUDE_SESSION_ID}"
```
