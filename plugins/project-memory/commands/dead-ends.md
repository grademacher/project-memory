---
description: Turn the project-memory dead-end checker on or off for this project, or show whether it is on.
argument-hint: "[on|off]"
allowed-tools: Bash(node:*)
---

Run this with the Bash tool, exactly as written:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" "${CLAUDE_PROJECT_DIR}" dead-ends $ARGUMENTS
```

If `${CLAUDE_PROJECT_DIR}` is empty or appears unexpanded, use the current
working directory instead.

Report the script's one-line result and nothing more. If it prints a usage
error, say the argument must be `on`, `off` or nothing. If the checker was
just turned on or off, add that the change applies from the next session
start (or after `/compact`); until then, this session is unchanged.
