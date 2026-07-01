---
description: Transfer the current Claude Code session into a resumable Claude Code session
argument-hint: "[--source <claude-jsonl>]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" transfer "$ARGUMENTS"`

Present the command output to the user exactly as returned. Preserve the session id and the manual resume command.