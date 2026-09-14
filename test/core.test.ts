import assert from "node:assert/strict";
import test from "node:test";
import { extractContract, detectAmbiguity } from "../src/core/intent.js";
import { compact, shouldCompact } from "../src/core/compact.js";
import { measure } from "../src/core/measure.js";
import { loopFinding } from "../src/core/guard.js";
import type { TaskState } from "../src/core/task-state.js";
import { StateStore } from "../src/state/store.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("compaction respects its watermark and intervention budget", () => {
  const value = state();
  value.activities = Array.from({ length: 7 }, () => ({ kind: "file_read" as const, target: "same.ts", outcome: "pass" as const, outputBytes: 0 }));
  value.session = { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: [], lastCompactedActivity: 7, compactions: 1, budget: { interventions: 2, compactions: 1, expensiveChecks: 1, skillInvocations: 2, extraLlmCalls: 0 }, observations: [], repeatReadsDetected: 0 };
  assert.equal(shouldCompact(value).compact, false);
});

test("measurement does not equate absent tests with verification", () => {
  const value = measure(state(), [], [], new Date("2026-01-01T00:00:01.000Z"));
  assert.equal(value.clean, true); assert.equal(value.verified, false); assert.equal(value.firstPass, false);
});

test("only blocking findings prevent a clean result", () => {
  const advisory = state(); advisory.findings.push({ code: "dependency-added", severity: "warning", blocking: false, message: "review", evidence: ["x"] });
  const blocking = state(); blocking.findings.push({ code: "test-deleted", severity: "error", blocking: true, message: "restore", evidence: ["x"] });
  assert.equal(measure(advisory, [], [], new Date("2026-01-01T00:00:01.000Z")).clean, true); assert.equal(measure(blocking, [], [], new Date("2026-01-01T00:00:01.000Z")).clean, false);
});

test("state ids cannot escape the local state directory", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-"));
  try { await assert.rejects(new StateStore(cwd).loadTask("../../outside"), /Invalid task id/); } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("state loading rejects malformed and oversized records", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-")), store = new StateStore(cwd), tasks = join(cwd, ".gauntlet/tasks");
  try {
    await mkdir(tasks, { recursive: true }); await writeFile(join(tasks, "bad.json"), JSON.stringify({ version: 2, id: "bad" }));
    await assert.rejects(store.loadTask("bad"), /Invalid Gauntlet task state/);
    await writeFile(join(tasks, "large.json"), " ".repeat(256_001)); await assert.rejects(store.loadTask("large"), /exceeds 256KB/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("state loading rejects records copied from another repository", async () => {
  const first = await mkdtemp(join(tmpdir(), "gauntlet-state-first-")), second = await mkdtemp(join(tmpdir(), "gauntlet-state-second-"));
  try {
    const value = state(); value.repository = first; await new StateStore(first).saveTask(value);
    await mkdir(join(second, ".gauntlet/tasks"), { recursive: true }); await writeFile(join(second, ".gauntlet/tasks/task.json"), JSON.stringify(value));
    await assert.rejects(new StateStore(second).loadTask("task"), /Invalid Gauntlet task state/);
  } finally { await rm(first, { recursive: true, force: true }); await rm(second, { recursive: true, force: true }); }
});

test("concurrent state updates do not lose activities", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-")), store = new StateStore(cwd), value = state();
  try {
    value.repository = cwd; await store.saveTask(value);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateTask("task", (current) => { current.activities.push({ kind: "command", target: String(index), outputBytes: 0 }); })));
    assert.equal((await store.loadTask("task")).activities.length, 20);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
