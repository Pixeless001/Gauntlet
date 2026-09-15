import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GauntletEngine } from "../src/core/engine.js";
import type { CounterfactualEnvironment } from "../src/verify/counterfactual.js";
import { run } from "../src/repo/process.js";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

test("engine executes a task lifecycle against its task-start baseline", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-"));
  try {
    await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } }));
    await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "feature.ts"), "const oldValue = 1;\n");
    await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
    await writeFile(join(cwd, "preexisting.ts"), "dirty before task\n");
    const engine = new GauntletEngine(cwd), started = await engine.start("Change feature.ts without adding dependencies", "task-1");
    assert.match(started.injection, /smallest justified/); assert.match(started.injection, /# IMPLEMENT/); assert.equal(started.clarification, null);
    await writeFile(join(cwd, "feature.ts"), "const newValue = 2;\n");
    const result = await engine.finish("task-1");
    assert.equal(result.files, 1); assert.equal(result.verified, true); assert.equal(result.firstPass, true);
    assert.equal(JSON.parse(await readFile(join(cwd, ".gauntlet", "last-result.json"), "utf8")).taskId, "task-1");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("repeated finish is idempotent", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-finish-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "client.test.ts"), "test('x', () => assert.equal(1, 1));\n");
    const engine = new GauntletEngine(cwd); await engine.start("Change tests", "task"); await writeFile(join(cwd, "client.test.ts"), "");
    const first = await engine.finish("task"), second = await engine.finish("task"); assert.deepEqual(second.findings, first.findings); assert.deepEqual(second.conventions, first.conventions);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("resolved finish findings do not poison later attempts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-repair-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "client.test.ts"), "test('x', () => assert.equal(1, 1));\n");
    const engine = new GauntletEngine(cwd); await engine.start("Change tests", "task"); await writeFile(join(cwd, "client.test.ts"), ""); assert.equal((await engine.finish("task")).clean, false);
    await writeFile(join(cwd, "client.test.ts"), "test('x', () => assert.equal(1, 1));\n"); assert.equal((await engine.finish("task")).clean, true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("engine tracks repeated unchanged reads and invalidates on writes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-observations-"));
  try {
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n"); const engine = new GauntletEngine(cwd); await engine.start("Change source.ts", "observations");
    await engine.activity("observations", { kind: "file_read", target: "source.ts", outcome: "pass", outputBytes: 10 }); await engine.activity("observations", { kind: "file_read", target: "source.ts", outcome: "pass", outputBytes: 10 });
    let state = (await engine.activity("observations", { kind: "message", outputBytes: 0 })).state; assert.equal(state.session?.repeatReadsDetected, 1); assert.equal(state.session?.observations.length, 1);
    state = (await engine.activity("observations", { kind: "file_write", target: "source.ts", outcome: "pass", outputBytes: 0 })).state; assert.equal(state.session?.observations.length, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("engine activates investigation after a repeated unresolved failure", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-transition-"));
  try {
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n"); const engine = new GauntletEngine(cwd);
    await engine.start("Implement behavior in source.ts", "transition");
    await engine.activity("transition", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 10 });
    const result = await engine.activity("transition", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 10 });
    assert.deepEqual(result.state.session?.activeSkills, ["investigate"]);
    assert.equal(result.state.session?.selectionTraces?.at(-1)?.trigger, "repeated_failure");
    assert.equal(result.continuation?.workflow, "investigate"); assert.match(result.continuation?.guidance ?? "", /# INVESTIGATE/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("validated cause resumes implementation on the active execution path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-cause-"));
  try {
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n"); const engine = new GauntletEngine(cwd); await engine.start("Fix race in source.ts", "cause");
    await engine.activity("cause", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 1 }); await engine.activity("cause", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 1 });
    const result = await engine.activity("cause", { kind: "decision_signal", target: "cause: missing request coalescing", outcome: "pass", outputBytes: 0, evidenceRef: "test:race" });
    assert.deepEqual(result.state.session?.activeSkills, ["implement"]); assert.equal(result.state.session?.uncertainty?.cause, "resolved");
    assert.equal(result.continuation?.workflow, "implement"); assert.match(result.continuation?.guidance ?? "", /# IMPLEMENT/);
    assert.equal(result.state.session?.execution?.checkpoints.at(-1)?.kind, "implementation"); assert.equal(result.state.session?.execution?.events.at(-1)?.evidenceRef, "test:race");
    const resumed = await engine.start("ignored", "cause"); assert.match(resumed.injection, /Current: missing request coalescing/); assert.match(resumed.injection, /Evidence: test:race/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("workflow transitions do not consume the compaction budget", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-workflow-budget-"));
  try {
    await writeFile(join(cwd, "source.ts"), "export const value = 1;\n"); const engine = new GauntletEngine(cwd); await engine.start("Change source.ts", "budget");
    await engine.activity("budget", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 10 });
    const transitioned = await engine.activity("budget", { kind: "command", target: "npm test", outcome: "fail", outputBytes: 10 });
    assert.equal(transitioned.continuation?.workflow, "investigate"); assert.equal((await engine.state("budget")).session?.compactions, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("execution signals update workflow and risk uncertainty", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-signals-"));
  try {
    await writeFile(join(cwd, "component.tsx"), "export const Component = () => null;\n"); const engine = new GauntletEngine(cwd); await engine.start("Change component.tsx", "signals");
    await engine.activity("signals", { kind: "file_write", target: "src/migrations/access.ts", outcome: "pass", outputBytes: 0 });
    await engine.activity("signals", { kind: "file_write", target: "component.tsx", outcome: "pass", outputBytes: 0 }); await engine.activity("signals", { kind: "file_write", target: "component.tsx", outcome: "pass", outputBytes: 0 });
    const result = await engine.activity("signals", { kind: "file_write", target: "component.tsx", outcome: "pass", outputBytes: 0 });
    assert.equal(result.state.session?.uncertainty?.visual, "open"); assert.equal(result.state.session?.uncertainty?.repoFit, "open"); assert.equal(result.state.session?.uncertainty?.regression, "open");
    assert.equal(result.state.session?.selectionTraces?.at(-1)?.trigger, "repeated_rewrite"); assert.deepEqual(result.state.session?.activeSkills, ["investigate"]);
    const tested = await engine.activity("signals", { kind: "test_result", target: "component.test.tsx", outcome: "pass", outputBytes: 0 });
    assert.equal(tested.state.session?.uncertainty?.behavior, "resolved"); assert.equal(tested.state.session?.uncertainty?.regression, "open");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("elevated new tests reject weak counterfactual evidence when a provider is available", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    const git = (args: string[]) => execFile("git", args, { cwd }); await git(["init"]); await git(["config", "user.email", "test@example.com"]); await git(["config", "user.name", "Test"]); await git(["add", "."]); await git(["commit", "-m", "base"]);
    const environment: CounterfactualEnvironment = { kind: "sandbox-provider", id: "old", root: cwd, candidateEvidenceAvailable: true, run: async () => ({ command: "test", exitCode: 0, stdout: "", stderr: "", durationMs: 1, timedOut: false }) };
    let candidateTests: string[] = []; const engine = new GauntletEngine(cwd, { preChangeEnvironment: async (_head, tests) => { candidateTests = tests; return environment; } }); await engine.start("Fix authentication race", "task"); await writeFile(join(cwd, "auth.test.ts"), "test('race', () => {});\n");
    const result = await engine.finish("task"); assert.equal(result.findings.some((finding) => finding.startsWith("weak-counterfactual")), true);
    assert.deepEqual(candidateTests, ["auth.test.ts"]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("successful completion records a validated verification checkpoint", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-verification-state-")); try { await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); const engine = new GauntletEngine(cwd); await engine.start("Change feature.ts", "verified"); await writeFile(join(cwd, "feature.ts"), "export const value = 1;\n"); await engine.finish("verified"); const resumed = await engine.start("", "verified"); assert.equal(resumed.state.session?.execution?.checkpoints.at(-1)?.kind, "verification"); assert.equal(resumed.state.session?.execution?.checkpoints.at(-1)?.status, "validated"); assert.equal(resumed.state.session?.uncertainty?.scope, "resolved"); } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("static checks do not claim behavioral evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-static-evidence-"));
  try {
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } })); await writeFile(join(cwd, "package-lock.json"), "{}");
    const engine = new GauntletEngine(cwd); await engine.start("Change runtime behavior", "static"); await writeFile(join(cwd, "feature.ts"), "export const value = 1;\n"); await engine.finish("static");
    const state = await engine.state("static"); assert.equal(state.session?.uncertainty?.scope, "resolved"); assert.equal(state.session?.uncertainty?.behavior, "open");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("documentation completion stays silent instead of expanding the code graph", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-docs-"));
  try {
    await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
    await writeFile(join(cwd, "README.md"), "before\n"); await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
    await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
    const engine = new GauntletEngine(cwd); await engine.start("Fix typo in README.md", "docs"); await writeFile(join(cwd, "README.md"), "after\n");
    const result = await engine.finish("docs");
    assert.equal(result.selection?.graphExpansions, 0); assert.equal(result.checksRun, 1); assert.equal(result.verified, true);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
