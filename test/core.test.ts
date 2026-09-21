import assert from "node:assert/strict";
import test from "node:test";
import { extractContract, detectAmbiguity } from "../src/core/intent.js";
import { compact, shouldCompact } from "../src/core/compact.js";
import { frontierWait, measure } from "../src/core/measure.js";
import { loopFinding } from "../src/core/guard.js";
import { createControlState, createTaskWorld, type TaskState } from "../src/core/task-state.js";
import { StateStore } from "../src/state/store.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = (): TaskState => {
  const contract = { ...extractContract("Fix race"), acceptanceCriteria: ["No duplicate refresh"], constraints: ["Preserve API"], preservationRequirements: ["Preserve API"] };
  return { version: 3, id: "task", repository: "/repo", startedAt: "2026-01-01T00:00:00.000Z", contract, clarifications: [], baseline: { head: "a", status: [], dependencies: [], files: {}, tests: {} }, workingSet: ["src/session.ts"], repositoryFacts: [], activities: [], findings: [], attempts: 1, control: createControlState(contract), world: createTaskWorld(contract, "a") };
};

test("extracts task paths, criteria, and constraints", () => {
  const request = "  Fix src/client/retry.ts\n- must preserve errors\n- add boundary coverage  ";
  const value = extractContract(request, { files: ["src/client/retry.ts"] });
  assert.equal(value.intent, request);
  assert.equal(value.goal, "Fix src/client/retry.ts");
  assert.deepEqual(value.explicitPaths, ["src/client/retry.ts"]);
  assert.deepEqual(value.constraints, ["must preserve errors"]);
  assert.deepEqual(value.preservationRequirements, ["must preserve errors"]);
  assert.deepEqual(value.expectedFrontier, ["src/client/retry.ts"]);
});

test("task sizing is deterministic and planning depth remains impact-bound", () => {
  assert.equal(extractContract("Fix README typo").size, "tiny");
  assert.equal(extractContract("Change src/a.ts").size, "local");
  assert.equal(extractContract("Integrate cross-package behavior").size, "distributed");
  assert.equal(extractContract("Perform a repository-wide migration").size, "systemic");
});

test("only flags costly ambiguity", () => {
  assert.equal(detectAmbiguity(extractContract("Add retry support with three attempts")).costly, false);
  assert.equal(detectAmbiguity(extractContract("Use the appropriate behavior")).costly, true);
  assert.equal(detectAmbiguity(extractContract("Use the appropriate variable name")).costly, false);
});

test("compaction preserves contract and unresolved findings", () => {
  const value = state();
  value.control.context.pressure = "high"; value.control.lifecycle.boundary = "strong";
  value.activities.push(...Array.from({ length: 3 }, () => ({ kind: "command" as const, target: "npm test", outcome: "fail" as const, outputBytes: 10 })));
  value.findings.push({ code: "failure", severity: "warning", message: "Boundary unresolved", proof: [] });
  assert.deepEqual(shouldCompact(value).reasons, ["multiple failed attempts"]);
  assert.deepEqual(compact(value), { task: "Fix race", goal: "Fix race", acceptanceCriteria: ["No duplicate refresh"], preservationRequirements: ["Preserve API"], constraints: ["Preserve API"], repoConstraints: [], workingSet: ["src/session.ts"], currentApproach: "Fix race", unresolved: ["location", "cause", "repoFit", "behavior", "regression", "scope", "Boundary unresolved"], failedApproaches: [], artifactRefs: [], recentTurns: [] });
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
  value.control.context.pressure = "high"; value.control.lifecycle.boundary = "strong";
  value.activities = Array.from({ length: 7 }, () => ({ kind: "file_read" as const, target: "same.ts", outcome: "pass" as const, outputBytes: 0 }));
  value.control.lastCompactedActivity = 7; value.control.compactions = 1; value.control.budget.skillInvocations = 2;
  assert.equal(shouldCompact(value).compact, false);
});

test("unknown context pressure never triggers proactive compaction", () => {
  const value = state(); value.activities = Array.from({ length: 7 }, () => ({ kind: "file_read" as const, target: "same.ts", outcome: "pass" as const, outputBytes: 100_000 }));
  value.control.lifecycle.boundary = "strong";
  assert.equal(shouldCompact(value).compact, false);
});

test("measurement does not equate absent tests with verification", () => {
  const value = measure(state(), [], [], new Date("2026-01-01T00:00:01.000Z"));
  assert.equal(value.clean, true); assert.equal(value.verified, false); assert.equal(value.firstPass, false);
});

test("measurement never reports success when completion remains unresolved", () => {
  const result = measure(state(), [], [{ id: "test", reason: "test", command: "test", exitCode: 0, stdout: "", stderr: "", durationMs: 1, timedOut: false, status: "pass" }], new Date("2026-01-01T00:00:01.000Z"), { status: "incomplete", reasons: ["unresolved behavior"], missingProof: [] });
  assert.equal(result.clean, true); assert.equal(result.verified, true); assert.equal(result.completion, "incomplete"); assert.equal(result.firstPass, false); assert.equal(result.directive?.action, "incomplete");
});

test("only blocking findings prevent a clean result", () => {
  const advisory = state(); advisory.findings.push({ code: "dependency-added", severity: "warning", blocking: false, message: "review", proof: ["x"] });
  const blocking = state(); blocking.findings.push({ code: "test-deleted", severity: "error", blocking: true, message: "restore", proof: ["x"] });
  assert.equal(measure(advisory, [], [], new Date("2026-01-01T00:00:01.000Z")).clean, true); assert.equal(measure(blocking, [], [], new Date("2026-01-01T00:00:01.000Z")).clean, false);
});

test("measurement exposes selection and execution-memory restraint", () => {
  const value = state(); value.control.execution = { activeCheckpointId: "root", nextEvent: 1, events: [{ index: 0, type: "command", outcome: "pass" }], checkpoints: [{ id: "root", kind: "task", status: "active", summary: "task", constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], proofRefs: [], createdFromEvent: 0, resolves: [] }] };
  const result = measure(value, [], [{ id: "check", reason: "check", command: "check", exitCode: 0, stdout: "", stderr: "", durationMs: 1, timedOut: false, status: "pass", summary: "pass" }]);
  assert.deepEqual(result.selection, { interventions: 0, traces: 0, averageDepth: 0, graphExpansions: 0, externalDocCalls: 0, browserActivations: 0, delegations: 0 }); assert.deepEqual(result.memory, { rawEvents: 1, checkpoints: 1, activePath: 1, rejectedBranches: 0 });
});

test("measurement separates frontier, evidence, and redo metrics", () => {
  const value = state(); value.world.work.nodes = { inspect: { id: "inspect", title: "inspect", kind: "inspection", executor: "worker", required: true, state: "VALIDATED", attempt: 2, duration: "short", dependencies: [], validityInputs: [], writePaths: [], resolves: [], evidenceRefs: ["proof", "proof"], criticalPath: 2 } };
  const result = measure(value, [], [], new Date(), undefined, { frontierWaitMs: 5, maxFrontier: 2, semanticSynthesis: 1, workerCandidates: 1 });
  assert.deepEqual(result.orchestration, { nodes: 1, requiredNodes: 1, validatedNodes: 1, staleNodes: 0, collapsedNodes: 0, criticalPath: 2, decisionRevision: value.world.decision.revision, eventSequence: value.world.appliedEvent, totalNodeAttempts: 2, duplicateEvidence: 1, frontierWaitMs: 5, maxFrontier: 2, fanOutBenefit: 1, workerCandidates: 1, semanticSynthesis: 1, verifierYield: 0, redoRate: 0.5, writeConflicts: 0 });
  assert.equal(frontierWait([{ at: "2026-01-01T00:00:00.000Z", type: "NODE_READY", nodeId: "inspect" }, { at: "2026-01-01T00:00:00.005Z", type: "NODE_STARTED", nodeId: "inspect" }]), 5);
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

test("state loading atomically migrates first-version control defaults", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-migration-")), store = new StateStore(cwd), value = state();
  try {
    value.repository = cwd;
    const legacy = { ...value, version: 1, session: { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: [], lastCompactedActivity: 0, compactions: 0, budget: value.control.budget } };
    delete (legacy as { control?: unknown }).control; await mkdir(join(cwd, ".gauntlet/tasks"), { recursive: true }); await writeFile(join(cwd, ".gauntlet/tasks/task.json"), JSON.stringify(legacy));
    const loaded = await store.loadTask("task"); assert.deepEqual(loaded.control.observations, []); assert.equal(loaded.version, 3);
    assert.equal(loaded.control.execution.checkpoints[0]?.kind, "task"); assert.equal(loaded.control.execution.activeCheckpointId, "task-root");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("concurrent state updates do not lose activities", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-")), store = new StateStore(cwd), value = state();
  try {
    value.repository = cwd; await store.saveTask(value);
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateTask("task", (current) => { current.activities.push({ kind: "command", target: String(index), outputBytes: 0 }); })));
    assert.equal((await store.loadTask("task")).activities.length, 20);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("task state never persists raw tool payloads", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-state-")), store = new StateStore(cwd), value = state();
  try {
    value.repository = cwd;
    value.activities.push({ kind: "command", outputBytes: 8, toolPayload: { operation: "run", input: "secret-input", output: "secret-output", status: "pass", paths: [], symbols: [], processor: "log" } } as never);
    await store.saveTask(value);
    const text = await readFile(join(cwd, ".gauntlet/tasks/task.json"), "utf8");
    assert.doesNotMatch(text, /secret-(?:input|output)/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
