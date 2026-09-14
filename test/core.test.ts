import assert from "node:assert/strict";
import test from "node:test";
import { extractContract, detectAmbiguity } from "../src/core/intent.js";
import { compact, shouldCompact } from "../src/core/compact.js";
import { measure } from "../src/core/measure.js";
import { loopFinding } from "../src/core/guard.js";
import type { TaskState } from "../src/core/task-state.js";
import { StateStore } from "../src/state/store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = (): TaskState => ({ version: 1, id: "task", repository: "/repo", startedAt: "2026-01-01T00:00:00.000Z", contract: { intent: "Fix race", acceptanceCriteria: ["No duplicate refresh"], explicitPaths: [], constraints: ["Preserve API"] }, baseline: { head: "a", status: [], dependencies: [], files: {}, tests: {} }, workingSet: ["src/session.ts"], repositoryFacts: [], activities: [], findings: [], attempts: 1 });

test("extracts task paths, criteria, and constraints", () => {
  const value = extractContract("Fix src/client/retry.ts\n- must preserve errors\n- add boundary coverage");
  assert.deepEqual(value.explicitPaths, ["src/client/retry.ts"]);
  assert.deepEqual(value.constraints, ["must preserve errors"]);
});

test("only flags costly ambiguity", () => {
  assert.equal(detectAmbiguity(extractContract("Add retry support with three attempts")).costly, false);
  assert.equal(detectAmbiguity(extractContract("Use the appropriate behavior")).costly, true);
});

test("compaction preserves contract and unresolved findings", () => {
  const value = state();
  value.activities.push(...Array.from({ length: 3 }, () => ({ kind: "command" as const, target: "npm test", outcome: "fail" as const, outputBytes: 10 })));
  value.findings.push({ code: "failure", severity: "warning", message: "Boundary unresolved", evidence: [] });
  assert.deepEqual(shouldCompact(value).reasons, ["multiple failed attempts"]);
  assert.deepEqual(compact(value), { task: "Fix race", acceptanceCriteria: ["No duplicate refresh"], constraints: ["Preserve API"], repoConstraints: [], workingSet: ["src/session.ts"], unresolved: ["Boundary unresolved"], failedApproaches: ["npm test"] });
});

test("repeated file reads compact while distinct command failures do not form a loop", () => {
  const value = state();
  value.activities.push(...Array.from({ length: 7 }, () => ({ kind: "file_read" as const, target: "src/session.ts", outcome: "pass" as const, outputBytes: 1 })));
  value.activities.push({ kind: "command", target: "npm test -- auth", outcome: "fail", outputBytes: 1 }, { kind: "command", target: "npm test -- billing", outcome: "fail", outputBytes: 1 }, { kind: "command", target: "npm test -- user", outcome: "fail", outputBytes: 1 });
  assert.ok(shouldCompact(value).reasons.includes("repeated file reads"));
  assert.equal(loopFinding(value), null);
});

test("measurement does not equate absent tests with verification", () => {
  const value = measure(state(), [], [], new Date("2026-01-01T00:00:01.000Z"));
  assert.equal(value.clean, true); assert.equal(value.verified, false); assert.equal(value.firstPass, false);
});

test("unresolved warnings prevent a clean result", () => {
  const value = state(); value.findings.push({ code: "dependency-added", severity: "warning", message: "review", evidence: ["x"] });
  assert.equal(measure(value, [], [], new Date("2026-01-01T00:00:01.000Z")).clean, false);
});

test("state ids cannot escape the local state directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-"));
  try { await assert.rejects(new StateStore(cwd).loadTask("../../outside"), /Invalid task id/); } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("concurrent state updates do not lose activities", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-")), store = new StateStore(cwd), value = state();
  try {
    value.repository = cwd; await store.saveTask(value);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateTask("task", (current) => { current.activities.push({ kind: "command", target: String(index), outputBytes: 0 }); })));
    assert.equal((await store.loadTask("task")).activities.length, 20);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
