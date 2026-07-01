#!/usr/bin/env node
/**
 * claude-companion - dispatcher stub for the Claude Code plugin.
 *
 * Implementation plan (copy from kilo-plugin-cc/plugins/kilo/scripts/kilo-companion.mjs):
 *   - swap `import "./lib/kilo.mjs"` for `import "./lib/claude.mjs"`
 *   - swap `runKilo`/`getKiloAvailability`/`getKiloAuthStatus` calls for their
 *     `runClaude`/`getClaudeAvailability`/`getClaudeAuthStatus` equivalents
 *   - the CLI binary is `claude`
 */
import process from "node:process";

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/claude-companion.mjs setup [--json]",
      "  node scripts/claude-companion.mjs review [--wait|--background] [--base <ref>]",
      "  node scripts/claude-companion.mjs adversarial-review [--wait|--background] [--base <ref>] [focus text]",
      "  node scripts/claude-companion.mjs task [--background] [--write] [--resume|--fresh] [prompt]",
      "  node scripts/claude-companion.mjs status [job-id] [--json]",
      "  node scripts/claude-companion.mjs result [job-id] [--json]",
      "  node scripts/claude-companion.mjs cancel [job-id] [--json]"
    ].join("\n")
  );
}

async function main() {
  const [subcommand] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printUsage();
    return;
  }
  process.stderr.write(
    "`claude-companion` is a stub. See ../../../kilo-plugin-cc/plugins/kilo/scripts/kilo-companion.mjs for a complete reference implementation. The CLI binary is `claude`.\n"
  );
  process.exitCode = 1;
}

main();