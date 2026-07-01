---
description: Check whether the local Claude Code CLI is ready and authenticated
argument-hint: '[]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" setup --json $ARGUMENTS
```

If the result says Claude CLI is unavailable:
- Claude Code CLI should already be on PATH if Claude Code itself is installed.
- Use `AskUserQuestion` exactly once to ask whether Claude Code is installed.
  - `Claude Code is installed (Recommended)`
  - `Skip for now`

If Claude CLI is available but unauthenticated:
- The Claude plugin defers to Claude Code's own auth state (`~/.claude`).
- Use `AskUserQuestion` exactly once to ask whether Claude should run `claude auth`.
  - `Run claude auth (Recommended)`
  - `Skip for now`

Output rules:
- Present the final setup output to the user.
- If install/auth was skipped, present the original setup output.