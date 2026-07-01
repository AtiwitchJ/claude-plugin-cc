import { test } from "node:test";
import assert from "node:assert/strict";

import { DIRECT_INVOCATION, isStubError } from "../plugins/claude/scripts/lib/delegate.mjs";

test("delegate: DIRECT_INVOCATION has all 8 agents", () => {
  const expected = ["kilo", "claude", "openclaw", "opencode", "antigravity", "cursor", "hermes", "jules"];
  for (const agent of expected) {
    assert.ok(DIRECT_INVOCATION[agent], `Missing agent: ${agent}`);
  }
});

test("delegate: each agent has binary + args function + shell flag", () => {
  for (const [agent, spec] of Object.entries(DIRECT_INVOCATION)) {
    assert.equal(typeof spec.binary, "string", `${agent} missing binary`);
    assert.ok(spec.binary.length > 0, `${agent} binary is empty`);
    assert.equal(typeof spec.args, "function", `${agent} args is not a function`);
    assert.equal(typeof spec.shell, "boolean", `${agent} shell is not boolean`);
    assert.equal(typeof spec.description, "string", `${agent} description missing`);
  }
});

test("delegate: kilo and openclaw use --shell (PowerShell wrappers)", () => {
  assert.equal(DIRECT_INVOCATION.kilo.shell, true);
  assert.equal(DIRECT_INVOCATION.openclaw.shell, true);
  assert.equal(DIRECT_INVOCATION.cursor.shell, true);
  assert.equal(DIRECT_INVOCATION.jules.shell, true);
});

test("delegate: claude and opencode do not use --shell", () => {
  assert.equal(DIRECT_INVOCATION.claude.shell, false);
  assert.equal(DIRECT_INVOCATION.opencode.shell, false);
  assert.equal(DIRECT_INVOCATION.hermes.shell, false);
  assert.equal(DIRECT_INVOCATION.antigravity.shell, false);
});

test("delegate: kilo args include --auto", () => {
  const args = DIRECT_INVOCATION.kilo.args("hello");
  assert.ok(args.includes("--auto"));
  assert.ok(args.includes("hello"));
});

test("delegate: claude args include --print", () => {
  const args = DIRECT_INVOCATION.claude.args("hello");
  assert.deepEqual(args, ["--print", "hello"]);
});

test("delegate: openclaw args include --local and --message", () => {
  const args = DIRECT_INVOCATION.openclaw.args("hello");
  assert.ok(args.includes("--local"));
  assert.ok(args.includes("--message"));
  assert.ok(args.includes("hello"));
});

test("delegate: hermes args use -z", () => {
  const args = DIRECT_INVOCATION.hermes.args("hello");
  assert.deepEqual(args, ["-z", "hello"]);
});

test("delegate: cursor args use -p", () => {
  const args = DIRECT_INVOCATION.cursor.args("hello");
  assert.ok(args.includes("-p"));
  assert.ok(args.includes("hello"));
});

test("delegate: isStubError detects 'is a stub'", () => {
  assert.equal(isStubError("`foo-companion` is a stub. See ../kilo", ""), true);
  assert.equal(isStubError("", "`opencode-companion` is a stub"), true);
  assert.equal(isStubError("", "Not implemented yet"), true);
  assert.equal(isStubError("All good!", ""), false);
});