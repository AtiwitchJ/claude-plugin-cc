import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCommand, binaryAvailable } from "./process.mjs";

const CLAUDE_BINARY = "claude";
const CLAUDE_CREDENTIALS_DIR = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");

function cleanClaudeStderr(stderr) {
  return stderr
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        line &&
        !/^(WARN|INFO|DEBUG|ERROR)/i.test(line.trim()) &&
        !line.startsWith("WARNING: proceeding, even though we could not update PATH:")
    )
    .join("\n");
}

/**
 * Spawn the `claude` binary and capture stdout (single JSON object) + stderr.
 *
 * Claude CLI shape:
 *   claude --print --output-format json "<prompt>"
 *
 * The CLI prints a single JSON object (not NDJSON) describing the result.
 */
function spawnClaude({ cwd, args, onProgress, logFile }) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BINARY, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (onProgress) {
        onProgress({ message: text.slice(0, 200), phase: "stdout" });
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (logFile) {
        fs.appendFileSync(logFile, `[stderr] ${text}`, "utf8");
      }
      if (onProgress) {
        const tail = text.trim().split(/\r?\n/).pop() ?? "";
        onProgress({ message: tail, phase: "stderr" });
      }
    });

    child.on("error", (err) => reject(err));
    child.on("close", (status, signal) => {
      resolve({ status: status ?? 0, signal, stdout, stderr });
    });
  });
}

export function parseClaudeEventStream(stdout) {
  const events = [];
  let sessionId = null;
  const textChunks = [];
  let error = null;
  let totalCost = null;
  let isError = false;

  const lines = stdout.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    events.push(parsed);

    if (typeof parsed.session_id === "string") {
      sessionId = parsed.session_id;
    }
    if (typeof parsed.result === "string") {
      textChunks.push(parsed.result);
    }
    if (parsed.is_error === true) {
      isError = true;
      error = parsed.result ?? parsed.error?.message ?? "claude reported an error result";
    }
    if (typeof parsed.total_cost_usd === "number") {
      totalCost = parsed.total_cost_usd;
    }
  }

  return {
    sessionId,
    text: textChunks.join("\n").trim(),
    error,
    isError,
    totalCost,
    events
  };
}

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

  const profile = runCommand(CLAUDE_BINARY, ["auth", "status"], { cwd });
  if (profile.error) {
    return {
      available: true,
      loggedIn: true,
      detail: "claude CLI found; auth state is managed by Claude Code under ~/.claude",
      source: "fallback",
      provider: "claude-code",
      email: null
    };
  }

  const stdout = profile.stdout.trim();
  const emailMatch = /email\s*[:=]\s*([^\s]+)/i.exec(stdout);
  const loggedIn = profile.status === 0 || Boolean(emailMatch);
  return {
    available: true,
    loggedIn,
    detail: loggedIn
      ? `Claude Code authenticated${emailMatch ? ` (${emailMatch[1]})` : ""}`
      : "claude CLI found but auth status unknown; run `claude auth status` to verify.",
    source: "auth-status",
    provider: "claude-code",
    email: emailMatch?.[1] ?? null
  };
}

export function buildClaudeArgs({ prompt, model, sessionId, continueLast, fork, json = true, additionalDirs = [] }) {
  const args = ["--print"];

  if (sessionId) {
    args.push("--resume", sessionId);
  } else if (continueLast) {
    args.push("--continue");
  }

  if (fork && (sessionId || continueLast)) {
    args.push("--fork-session");
  }

  if (model) {
    args.push("--model", model);
  }

  for (const dir of additionalDirs) {
    if (dir) args.push("--add-dir", dir);
  }

  if (json) {
    args.push("--output-format", "json");
  }

  if (prompt) {
    args.push(prompt);
  }

  return args;
}

/**
 * Run a Claude Code task in the foreground.
 */
export async function runClaude(cwd, options = {}) {
  ensureClaudeAvailable();

  const prompt = (options.prompt ?? "").trim() || (options.defaultPrompt ?? "").trim();
  if (!prompt && !options.sessionId && !options.continueLast) {
    throw new Error("A prompt is required for this claude run.");
  }

  const args = buildClaudeArgs({
    prompt,
    model: options.model ?? null,
    sessionId: options.sessionId ?? null,
    continueLast: Boolean(options.continueLast),
    fork: Boolean(options.fork),
    title: options.title ?? null,
    additionalDirs: options.additionalDirs ?? []
  });

  const execution = await spawnClaude({
    cwd,
    args,
    onProgress: options.onProgress,
    logFile: options.logFile ?? null
  });

  const cleanedStderr = cleanClaudeStderr(execution.stderr);
  const parsed = parseClaudeEventStream(execution.stdout);

  return {
    status: parsed.isError ? 1 : execution.status,
    signal: execution.signal,
    sessionId: parsed.sessionId,
    text: parsed.text,
    error: parsed.error,
    isError: parsed.isError,
    totalCost: parsed.totalCost,
    stderr: cleanedStderr,
    rawStdout: execution.stdout,
    events: parsed.events
  };
}

export async function findLatestResumableSession(cwd) {
  ensureClaudeAvailable();

  const result = runCommand(
    CLAUDE_BINARY,
    ["session", "list", "--format", "json"],
    { cwd }
  );

  if (!result.error && result.status === 0) {
    try {
      const parsed = JSON.parse(result.stdout);
      const sessions = Array.isArray(parsed) ? parsed : parsed.sessions ?? [];
      if (sessions.length > 0) {
        const first = sessions[0];
        const id = first.id ?? first.session_id ?? first.sessionId ?? null;
        if (id) return { id, source: "claude session list --format json" };
      }
    } catch {
      // fall through
    }
  }

  const textResult = runCommand(CLAUDE_BINARY, ["session", "list"], { cwd });
  if (textResult.error || textResult.status !== 0) {
    return null;
  }

  const lines = textResult.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const idMatch = /^[A-Za-z0-9_-]{6,}/.exec(lines[0]);
  if (!idMatch) return null;
  return { id: idMatch[0], source: "claude session list" };
}

export function ensureClaudeAvailable() {
  const status = getClaudeAvailability();
  if (!status.available) {
    throw new Error(
      "Claude Code CLI is not installed or not on PATH. Install Claude Code first (Claude Code ships the `claude` binary)."
    );
  }
}

export { CLAUDE_BINARY, CLAUDE_CREDENTIALS_DIR };