---
description: Run a Claude Code review that challenges the implementation approach and design choices
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [focus ...]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Run an adversarial Claude Code review through the shared plugin runtime.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Claude's output verbatim to the user.

Foreground flow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" adversarial-review "$ARGUMENTS"
```

Background flow:

```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" adversarial-review "$ARGUMENTS"`,
  description: "Claude Code adversarial review",
  run_in_background: true
})
```

- After launching, tell the user: "Claude Code adversarial review started in the background. Check `/claude:status` for progress."