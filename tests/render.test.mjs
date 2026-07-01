import { test } from "node:test";
import assert from "node:assert/strict";

import { renderTaskResult, renderStoredJobResult } from "../plugins/claude/scripts/lib/render.mjs";

test("renderTaskResult: defaults the output header to 'Claude output', not 'Kilo output' (bug #3)", () => {
  const out = renderTaskResult(
    { text: "fixed it", failureMessage: "" },
    { title: "Claude Task", jobId: "task-abc", write: false }
  );
  assert.match(out, /## Claude output/);
  assert.doesNotMatch(out, /## Kilo output/);
});

test("renderTaskResult: claude-companion.mjs passes agentName explicitly", () => {
  const out = renderTaskResult(
    { text: "fixed it", failureMessage: "" },
    { title: "Claude Task", agentName: "Claude" }
  );
  assert.match(out, /## Claude output/);
});

test("renderStoredJobResult: defaults the output header to 'Claude output'", () => {
  const job = { id: "task-1", title: "Claude Task" };
  const storedJob = { text: "done" };
  const out = renderStoredJobResult(job, storedJob);
  assert.match(out, /## Claude output/);
  assert.doesNotMatch(out, /## Kilo output/);
});
