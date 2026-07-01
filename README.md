# Claude Code plugin for Claude Code

This plugin is for Claude Code users who want to delegate code reviews or tasks to the
**Claude Code CLI** (`claude`) itself — useful for cross-session work, agent-of-agent
orchestration, or just running a fresh Claude session against a specific task without
cluttering the current Claude Code session.

## What You Get

- `/claude:review` for a normal read-only review
- `/claude:adversarial-review` for a steerable challenge review
- `/claude:rescue` to delegate investigation, a fix request, or follow-up work (runs `task`)
- `/claude:transfer` to import the current Claude Code session as a resumable Claude session
- `/claude:status`, `/claude:result`, and `/claude:cancel` to track background jobs
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

## Cross-agent delegation

`/claude:rescue` (and `claude-companion.mjs task` directly) accepts `--delegate-to=<agent>`
to route the prompt through another plugin's companion script instead of `claude` (e.g.
`--delegate-to=kilo`). Behavior:

1. If the target agent's companion is fully implemented, its output is returned as-is.
2. If the target's companion is a stub, `claude-companion.mjs` automatically falls back to
   invoking that agent's CLI binary directly (see `DIRECT_INVOCATION` in
   `scripts/lib/delegate.mjs`).

Extra flags that apply to the fallback path:

- `--prompt=<text>` — pass the prompt unambiguously instead of relying on trailing
  positional args (recommended when the prompt contains flag-like tokens).
- `--timeout=<ms>` — override the default 60s fallback timeout for a single call.
  You can also set the `CLAUDE_PLUGIN_DELEGATE_TIMEOUT_MS` environment variable to
  change the default for every delegated call.
- `--background` — when the fallback triggers, the target CLI is spawned detached and
  the command returns immediately with a PID and log file path instead of blocking.

## Reference

See `../kilo-plugin-cc/` — the reference implementation this plugin's scripts were
scaffolded from (`scripts/lib/delegate.mjs` and `render.mjs` are intentionally kept
byte-identical between the two repos; mirror any change to shared delegation logic there).

## License

Apache-2.0