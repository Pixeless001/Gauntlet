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
