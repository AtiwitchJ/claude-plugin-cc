---
description: Delegate investigation, an explicit fix request, or follow-up rescue work to the Claude Code rescue subagent
argument-hint: "[--background|--wait] [--resume|--fresh] [what Claude Code should investigate, solve, or continue]"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `claude:claude-rescue` subagent via the `Agent` tool (`subagent_type: "claude:claude-rescue"`), forwarding the raw user request as the prompt.
`claude:claude-rescue` is a subagent, not a skill — do not call `Skill(claude:claude-rescue)` (no such skill) or `Skill(claude:rescue)` (that re-enters this command and hangs the session).
The final user-visible response must be Claude Code's output verbatim.

Raw user request:
$ARGUMENTS

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" task ...` and return that command's stdout as-is.
- Return the Claude Code companion stdout verbatim to the user.
- If Claude Code is missing or unauthenticated, stop and tell the user to run `/claude:setup`.
- If the user did not supply a request, ask what Claude Code should investigate or fix.