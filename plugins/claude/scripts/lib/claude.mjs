import { binaryAvailable } from "./process.mjs";

/**
 * Claude Code CLI wrapper - stub.
 *
 * The plugin wraps the `claude` binary that ships with Claude Code. The companion
 * script forwards prompts to `claude --print "<prompt>"` (or equivalent) and
 * captures the assistant response.
 *
 * To turn this into a real implementation, copy
 * `../../kilo-plugin-cc/plugins/kilo/scripts/lib/kilo.mjs` and adapt:
 *   - replace the `kilo` binary with `claude`
 *   - replace `--format json` with `claude --print --output-format json` (or the
 *     equivalent non-interactive flag for the installed Claude Code version)
 *   - replace `kilo profile` auth probe with a check for `~/.claude` credentials
 *   - replace `kilo session list` resume lookup with whatever Claude Code uses
 *     to enumerate sessions (likely a sqlite db under `~/.claude/`)
 */
const CLAUDE_BINARY = "claude";

export function getClaudeAvailability(cwd) {
  return binaryAvailable(CLAUDE_BINARY, ["--version"], { cwd });
}

export async function getClaudeAuthStatus(cwd) {
  const availability = getClaudeAvailability(cwd);
  if (!availability.available) {
    return {
      available: false,
      loggedIn: false,
      detail: availability.detail,
      source: "availability",
      provider: null
    };
  }
  return {
    available: true,
    loggedIn: false,
    detail: "claude-companion is a stub. Implement scripts/lib/claude.mjs.",
    source: "stub",
    provider: null
  };
}

export async function runClaude() {
  throw new Error(
    "claude-companion is a stub. Implement scripts/lib/claude.mjs (see kilo-plugin-cc for a working reference)."
  );
}

export async function findLatestResumableSession(cwd) {
  return null;
}

export { CLAUDE_BINARY };