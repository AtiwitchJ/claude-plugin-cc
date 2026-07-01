# Claude Code plugin for Claude Code

This plugin is for Claude Code users who want to delegate code reviews or tasks to the
**Claude Code CLI** (`claude`) itself — useful for cross-session work, agent-of-agent
orchestration, or just running a fresh Claude session against a specific task without
cluttering the current Claude Code session.

## What You Get (once implemented)

- `/claude:review` for a normal read-only review
- `/claude:adversarial-review` for a steerable challenge review
- `/claude:rescue`, `/claude:transfer`, `/claude:status`, `/claude:result`, and `/claude:cancel`
- `/claude:setup` to verify the CLI and authentication

## Requirements

- **`claude` CLI** installed locally. Claude Code ships with this — no extra install needed.
- Authentication: Claude Code manages its own auth state (`~/.claude/`).
- **Node.js 18.18 or later**

## Installing the scaffold

```bash
/plugin marketplace add <your-org>/claude-plugin-cc
/plugin install claude@agents-plugin-cc-claude
```

The scaffold ships with stub commands that will fail with a "not implemented" error
until you wire up `plugins/claude/scripts/lib/claude.mjs` and
`plugins/claude/scripts/claude-companion.mjs`.

## Implementing the plugin

1. Open `plugins/claude/scripts/lib/claude.mjs` and replace the stub functions with real
   implementations that:
   - detect `claude` availability (`binaryAvailable` is already imported)
   - probe authentication by inspecting `~/.claude/` (`getClaudeAuthStatus`)
   - invoke the CLI in non-interactive mode (`runClaude`) — typically
     `claude --print --output-format json "<prompt>"`
   - discover a resumable session if available (`findLatestResumableSession`)
2. Open `plugins/claude/scripts/claude-companion.mjs` and copy the body of
   `../kilo-plugin-cc/plugins/kilo/scripts/kilo-companion.mjs`, renaming the imports from
   `./lib/kilo.mjs` to `./lib/claude.mjs` and the `runKilo` calls to your new wrapper.
3. Add tests under `tests/` that cover argument parsing, state, and the new wrapper.

## Cross-agent orchestration

The `claude` plugin is a natural delegation target for other agents. For example,
`/kilo:rescue --delegate-to=claude ...` could route a kilo task through the Claude
plugin instead. That feature is not implemented yet — see `kilo-plugin-cc/` for the
current rescue flow.

## Reference

See `../kilo-plugin-cc/` for a complete working example.

## License

Apache-2.0