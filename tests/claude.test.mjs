import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeArgs,
  getClaudeAvailability,
  parseClaudeEventStream
} from "../plugins/claude/scripts/lib/claude.mjs";

test("claude: buildClaudeArgs emits --print + --output-format json", () => {
  const args = buildClaudeArgs({ prompt: "hi", json: true });
  assert.ok(args.includes("--print"));
  assert.ok(args.includes("--output-format"));
  assert.ok(args.includes("json"));
  assert.equal(args[args.length - 1], "hi");
});

test("claude: buildClaudeArgs passes --resume when sessionId is set", () => {
  const args = buildClaudeArgs({ prompt: "continue", sessionId: "abc-123", json: true });
  const i = args.indexOf("--resume");
  assert.ok(i >= 0);
  assert.equal(args[i + 1], "abc-123");
});

test("claude: buildClaudeArgs adds --model when supplied", () => {
  const args = buildClaudeArgs({ prompt: "x", model: "claude-sonnet-4-6" });
  const i = args.indexOf("--model");
  assert.equal(args[i + 1], "claude-sonnet-4-6");
});

test("claude: buildClaudeArgs adds --continue for continueLast", () => {
  const args = buildClaudeArgs({ prompt: "x", continueLast: true });
  assert.ok(args.includes("--continue"));
});

test("claude: parseClaudeEventStream extracts result + session_id from a single JSON object", () => {
  const stream = JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1234,
    result: "pong",
    session_id: "sess-1",
    total_cost_usd: 0.001
  });
  const parsed = parseClaudeEventStream(stream);
  assert.equal(parsed.sessionId, "sess-1");
  assert.equal(parsed.text, "pong");
  assert.equal(parsed.isError, false);
  assert.equal(parsed.error, null);
  assert.equal(parsed.totalCost, 0.001);
  assert.equal(parsed.events.length, 1);
});

test("claude: parseClaudeEventStream surfaces error results", () => {
  const stream = JSON.stringify({
    type: "result",
    subtype: "error",
    is_error: true,
    result: "rate limit exceeded",
    session_id: "sess-2"
  });
  const parsed = parseClaudeEventStream(stream);
  assert.equal(parsed.isError, true);
  assert.equal(parsed.error, "rate limit exceeded");
  assert.equal(parsed.text, "rate limit exceeded");
});

test("claude: parseClaudeEventStream ignores non-JSON lines", () => {
  const stream = "warning: something\n" + JSON.stringify({ type: "result", result: "ok", session_id: "x" });
  const parsed = parseClaudeEventStream(stream);
  assert.equal(parsed.text, "ok");
  assert.equal(parsed.sessionId, "x");
});

test("claude: parseClaudeEventStream handles empty input", () => {
  const parsed = parseClaudeEventStream("");
  assert.equal(parsed.sessionId, null);
  assert.equal(parsed.text, "");
  assert.equal(parsed.events.length, 0);
});

test("claude: getClaudeAvailability probes --version", () => {
  // just check it returns a shape; underlying binary may or may not exist
  const result = getClaudeAvailability();
  assert.equal(typeof result.available, "boolean");
  assert.equal(typeof result.detail, "string");
});