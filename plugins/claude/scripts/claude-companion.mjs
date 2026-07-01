#!/usr/bin/env node
/**
 * claude-companion - dispatcher for the Claude Code plugin.
 *
 * Architecture mirrors kilo-plugin-cc but the wrapper invokes the local `claude`
 * CLI (Claude Code itself) instead of `kilo`. Supports cross-agent delegation via
 * `--delegate-to=<agent>`: routes the task to another plugin's companion script
 * (e.g. `--delegate-to=kilo` runs `node kilo-companion.mjs task ...`).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { parseArgs, splitRawArgumentString } from "./lib/args.mjs";
import {
  buildClaudeArgs,
  ensureClaudeAvailable,
  findLatestResumableSession,
  getClaudeAuthStatus,
  getClaudeAvailability,
  runClaude
} from "./lib/claude.mjs";
import {
  generateJobId,
  listJobs,
  setConfig,
  upsertJob,
  writeJobFile
} from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import {
  buildSingleJobSnapshot,
  buildStatusSnapshot,
  readStoredJob,
  resolveResultJob
} from "./lib/job-control.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobProgressUpdater,
  createJobRecord,
  createProgressReporter,
  runTrackedJob
} from "./lib/tracked-jobs.mjs";
import {
  renderCancelReport,
  renderJobStatusReport,
  renderStatusReport,
  renderStoredJobResult,
  renderSetupReport,
  renderTaskResult
} from "./lib/render.mjs";

const ROOT_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Known companion scripts for cross-agent delegation. */
const KNOWN_COMPANIONS = {
  kilo: "kilo-plugin-cc",
  claude: "claude-plugin-cc",
  openclaw: "openclaw-plugin-cc",
  opencode: "opencode-plugin-cc",
  antigravity: "antigravity-plugin-cc",
  cursor: "cursor-plugin-cc",
  hermes: "hermes-plugin-cc",
  jules: "jules-plugin-cc"
};

/**
 * Resolve the absolute path to another plugin's companion script.
 *
 * Search order:
 *   1. Sibling repo at D:\mind\<repo>
 *   2. Sibling repo at <cwd-parent>\<repo>
 *
 * Lets the user run claude-companion from anywhere without configuration.
 */
function resolveCompanionScript(agent) {
  const repo = KNOWN_COMPANIONS[agent];
  if (!repo) {
    throw new Error(`Unknown agent "${agent}". Known: ${Object.keys(KNOWN_COMPANIONS).join(", ")}`);
  }
  const candidates = [
    path.join("D:\\mind", repo, "plugins", agent, "scripts", `${agent}-companion.mjs`),
    path.join(process.cwd(), "..", repo, "plugins", agent, "scripts", `${agent}-companion.mjs`),
    path.resolve(ROOT_DIR, "..", "..", "..", "..", repo, "plugins", agent, "scripts", `${agent}-companion.mjs`)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not find ${agent}-companion.mjs. Tried:\n  ${candidates.join("\n  ")}`
  );
}

function delegateToAgent(agent, argv) {
  const script = resolveCompanionScript(agent);
  const quoted = argv
    .map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(" ");
  const result = spawnSync(process.execPath, [script, ...argv], {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd()
  });
  if (typeof result.status === "number") process.exit(result.status);
  process.exit(result.error ? 1 : 0);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/claude-companion.mjs setup [--json]",
      "  node scripts/claude-companion.mjs task [--background] [--delegate-to=<agent>] [--resume|--fresh] [--model <name>] [prompt]",
      "  node scripts/claude-companion.mjs status [job-id] [--json]",
      "  node scripts/claude-companion.mjs result [job-id] [--json]",
      "  node scripts/claude-companion.mjs cancel [job-id] [--json]",
      "  node scripts/claude-companion.mjs task-resume-candidate [--json]",
      "",
      `Known agents for --delegate-to: ${Object.keys(KNOWN_COMPANIONS).join(", ")}`
    ].join("\n")
  );
}

function outputResult(value, asJson) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    process.stdout.write(typeof value === "string" ? value : `${value}\n`);
  }
}

function normalizeArgv(argv) {
  if (argv.length === 1) return splitRawArgumentString(argv[0] ?? "");
  return argv;
}

function parseCommandInput(argv, config = {}) {
  return parseArgs(normalizeArgv(argv), { ...config });
}

function resolveCommandCwd(options = {}) {
  return options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd();
}

function firstMeaningfulLine(text, fallback) {
  const line = String(text ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);
  return line ?? fallback;
}

async function handleSetup(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const claudeStatus = getClaudeAvailability(cwd);
  const authStatus = await getClaudeAuthStatus(cwd);
  const config = (await import("./lib/state.mjs")).getConfig(workspaceRoot);

  const nextSteps = [];
  if (!claudeStatus.available) {
    nextSteps.push("Install Claude Code - the `claude` binary ships with Claude Code itself.");
  }
  if (claudeStatus.available && !authStatus.loggedIn) {
    nextSteps.push("Run `claude auth status` to check credentials, or restart Claude Code to re-authenticate.");
  }

  const report = {
    ready: claudeStatus.available && authStatus.loggedIn,
    claude: claudeStatus,
    auth: authStatus,
    workspaceRoot,
    config,
    nextSteps
  };
  outputResult(options.json ? report : renderSetupReport({ ...report, kilo: claudeStatus, auth: authStatus, workspaceRoot, nextSteps }), options.json);
}

async function executeTaskRun({ cwd, prompt, model, resume, additionalDirs, onProgress, logFile }) {
  ensureClaudeAvailable();

  let sessionId = null;
  let effectiveResume = Boolean(resume);
  if (effectiveResume) {
    const latest = await findLatestResumableSession(cwd);
    if (!latest) {
      throw new Error("No previous Claude session was found for this repository.");
    }
    sessionId = latest.id;
  }

  if (!prompt && !sessionId) {
    throw new Error("Provide a prompt, a prompt file, piped stdin, or use --resume.");
  }

  const result = await runClaude(cwd, {
    prompt,
    defaultPrompt: sessionId ? "Continue from the current session state." : "",
    model: model ?? null,
    sessionId,
    continueLast: false,
    fork: false,
    additionalDirs,
    onProgress,
    logFile
  });

  const failureMessage = result.error ?? result.stderr ?? "";
  const rendered = renderTaskResult(
    { text: result.text, failureMessage, reasoningSummary: result.totalCost !== null ? [`Cost: $${result.totalCost.toFixed(4)}`] : [] },
    {
      title: effectiveResume ? "Claude Resume" : "Claude Task",
      jobId: null,
      write: false
    }
  );

  return {
    exitStatus: result.status,
    sessionId: result.sessionId ?? sessionId,
    payload: {
      status: result.status,
      sessionId: result.sessionId ?? sessionId,
      text: result.text,
      stderr: result.stderr,
      error: result.error,
      totalCost: result.totalCost,
      resumed: effectiveResume
    },
    rendered,
    summary: firstMeaningfulLine(result.text, firstMeaningfulLine(failureMessage, "Claude task finished.")),
    jobTitle: effectiveResume ? "Claude Resume" : "Claude Task",
    jobClass: "task",
    write: false
  };
}

async function runForegroundCommand(job, runner, options = {}) {
  const logFile = options.logFile ?? createJobLogFile(job.workspaceRoot, job.id, job.title);
  job.logFile = logFile;
  const progress = createProgressReporter({
    stderr: !options.json,
    logFile,
    onEvent: createJobProgressUpdater(job.workspaceRoot, job.id)
  });
  const execution = await runTrackedJob({ ...job, logFile }, () => runner(progress), { logFile });
  outputResult(options.json ? execution.payload : execution.rendered, options.json);
  if (execution.exitStatus !== 0) process.exitCode = execution.exitStatus || 1;
  return execution;
}

async function handleTask(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["model", "cwd", "prompt-file", "delegate-to"],
    booleanOptions: ["json", "write", "resume", "fresh", "background"]
  });

  if (options["delegate-to"]) {
    const agent = String(options["delegate-to"]);
    const subcommand = process.argv[2];
    const remaining = process.argv.slice(3).filter((arg) => !arg.startsWith("--delegate-to=") && arg !== "--delegate-to");
    delegateToAgent(agent, [subcommand, ...remaining]);
    return;
  }

  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const resume = Boolean(options.resume);
  const fresh = Boolean(options.fresh);
  if (resume && fresh) {
    throw new Error("Choose either --resume or --fresh.");
  }

  const prompt = (() => {
    if (options["prompt-file"]) {
      return fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8");
    }
    const positionalPrompt = positionals.join(" ");
    return positionalPrompt || (fs.readFileSync(0, "utf8") || "").trim();
  })();

  const additionalDirs = options["add-dir"]
    ? String(options["add-dir"]).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const job = createJobRecord({
    id: generateJobId("task"),
    kind: "task",
    kindLabel: "task",
    title: resume ? "Claude Resume" : "Claude Task",
    workspaceRoot,
    jobClass: "task",
    summary: firstMeaningfulLine(prompt, "Task"),
    write: false,
    request: {
      cwd,
      prompt,
      model: options.model ?? null,
      resume,
      additionalDirs
    }
  });

  await runForegroundCommand(
    job,
    (progress) =>
      executeTaskRun({
        cwd,
        prompt,
        model: options.model ?? null,
        resume,
        additionalDirs,
        onProgress: progress,
        logFile: job.logFile
      }),
    { json: options.json }
  );
}

async function handleStatus(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json", "all"]
  });
  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";

  if (reference) {
    const snapshot = buildSingleJobSnapshot(cwd, reference);
    outputResult(options.json ? snapshot : renderJobStatusReport(snapshot.job), options.json);
    return;
  }
  const report = buildStatusSnapshot(cwd, { all: options.all });
  outputResult(options.json ? report : renderStatusReport(report), options.json);
}

function handleResult(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";
  const { workspaceRoot, job } = resolveResultJob(cwd, reference);
  const storedJob = readStoredJob(workspaceRoot, job.id);
  outputResult(options.json ? { job, storedJob } : renderStoredJobResult(job, storedJob), options.json);
}

function handleTaskResumeCandidate(argv) {
  const { options } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const sessionId = process.env.CLAUDE_SESSION_ID ?? null;
  const jobs = listJobs(workspaceRoot);
  const candidate = jobs.find(
    (job) =>
      job.jobClass === "task" &&
      (job.sessionId || job.threadId) &&
      job.status !== "queued" &&
      job.status !== "running"
  );
  const payload = {
    available: Boolean(candidate),
    sessionId,
    candidate: candidate
      ? {
          id: candidate.id,
          status: candidate.status,
          title: candidate.title ?? null,
          summary: candidate.summary ?? null,
          sessionId: candidate.sessionId ?? candidate.threadId ?? null,
          completedAt: candidate.completedAt ?? null,
          updatedAt: candidate.updatedAt ?? null
        }
      : null
  };
  const rendered = candidate
    ? `Resumable task found: ${candidate.id} (${candidate.status}).\n`
    : "No resumable task found for this session.\n";
  outputResult(options.json ? payload : rendered, options.json);
}

async function handleCancel(argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd"],
    booleanOptions: ["json"]
  });
  const cwd = resolveCommandCwd(options);
  const reference = positionals[0] ?? "";
  const { workspaceRoot, job } = resolveResultJob(cwd, reference);
  appendLogLine(job.logFile, "Cancelled by user.");
  const completedAt = new Date().toISOString();
  const nextJob = {
    ...job,
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    completedAt,
    errorMessage: "Cancelled by user."
  };
  writeJobFile(workspaceRoot, job.id, { ...(readStoredJob(workspaceRoot, job.id) ?? {}), ...nextJob, cancelledAt: completedAt });
  upsertJob(workspaceRoot, {
    id: job.id,
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    errorMessage: "Cancelled by user.",
    completedAt
  });
  const payload = { jobId: job.id, status: "cancelled", title: job.title };
  outputResult(options.json ? payload : renderCancelReport(nextJob), options.json);
}

async function main() {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printUsage();
    return;
  }

  switch (subcommand) {
    case "setup":
      await handleSetup(argv);
      break;
    case "task":
      await handleTask(argv);
      break;
    case "status":
      await handleStatus(argv);
      break;
    case "result":
      handleResult(argv);
      break;
    case "task-resume-candidate":
      handleTaskResumeCandidate(argv);
      break;
    case "cancel":
      await handleCancel(argv);
      break;
    default:
      throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});