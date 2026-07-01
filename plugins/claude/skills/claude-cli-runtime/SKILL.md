---
name: claude-cli-runtime
description: Operational guidance for calling the Claude Code CLI from this plugin's companion script.
---

# Claude Code CLI runtime

The Claude plugin wraps the **Claude Code CLI**, which is invoked as the binary `claude`
(not `claude-code` or `anthropic`). This skill explains how the companion should
invoke `claude` so the wrapper behaves predictably.

> **Status:** this is a scaffold skill. Once `scripts/lib/claude.mjs` is implemented,
> replace the placeholder below with real operational notes pulled from
> `kilo-plugin-cc/plugins/kilo/skills/kilo-cli-runtime/SKILL.md`.

## Binary

- Command name: `claude`
- Install: ships with Claude Code (no extra install needed if you already have Claude Code)
- Authentication: Claude Code manages its own OAuth/API key state under `~/.claude/`

## Placeholder invocation shape

Until the wrapper is implemented, the companion stubs return:

- `getClaudeAvailability(cwd)` -> `{ available, detail }` (probes `claude --version`)
- `getClaudeAuthStatus(cwd)` -> `{ available, loggedIn, detail }`
- `runClaude(cwd, options)` -> throws (not implemented)
- `findLatestResumableSession(cwd)` -> `null`

## Next steps

1. Document the real `claude` flags (model selector, sandbox, session resume, etc.).
2. Capture the JSON event shape so `runClaude` can parse stdout the same way `kilo.mjs` does.
3. Update this file with the actual `claude --print [flags] "<prompt>"` shape.