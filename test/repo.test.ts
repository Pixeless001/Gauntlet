import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRepository } from "../src/repo/detect.js";
import { selectContext } from "../src/repo/context.js";
import { formatContext } from "../src/core/context.js";
import { captureBaseline, changedFiles } from "../src/repo/git.js";
import { createRepoIndex } from "../src/repo/index.js";
import { run } from "../src/repo/process.js";
import type { ActiveExecutionContext } from "../src/execution-state/reconstruct.js";
import { contract } from "./support.js";

async function fixture(run: (cwd: string) => Promise<void>) { const cwd = await mkdtemp(join(tmpdir(), "gauntlet-")); try { await run(cwd); } finally { await rm(cwd, { recursive: true, force: true }); } }

test("detects declared npm tooling", () => fixture(async (cwd) => {
  await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "tsc", test: "node --test" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "tsconfig.json"), "{}");
  const profile = await detectRepository(cwd);
  assert.equal(profile.packageManager, "npm"); assert.equal(profile.language[0], "typescript"); assert.deepEqual(profile.commands.map((item) => item.name), ["typecheck", "test"]);
}));

test("detects Rust's deterministic local checks", () => fixture(async (cwd) => {
  await writeFile(join(cwd, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n"); await writeFile(join(cwd, "Cargo.lock"), "");
  const profile = await detectRepository(cwd);
  assert.equal(profile.packageManager, "cargo"); assert.deepEqual(profile.commands.map((item) => item.name), ["typecheck", "lint", "test"]);
}));

test("detects fallback and additional ecosystem checks", () => fixture(async (cwd) => {
  await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { check: "tool check" } })); await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "go.mod"), "module fixture\n");
  const profile = await detectRepository(cwd);
  assert.deepEqual(profile.language, ["go"]); assert.deepEqual(profile.commands.map((item) => item.name), ["check", "lint", "test"]);
}));

test("includes untracked files in the implementation footprint", () => fixture(async (cwd) => {
  await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
  await writeFile(join(cwd, "base.txt"), "base\n"); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd); const baseline = await captureBaseline(cwd);
  await writeFile(join(cwd, "new.ts"), "one\ntwo\n");
  assert.deepEqual(await changedFiles(cwd, baseline), [{ path: "new.ts", added: 3, removed: 0 }]);
}));

test("does not attribute pre-existing dirty files to a task", () => fixture(async (cwd) => {
  await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
  await writeFile(join(cwd, "existing.ts"), "before\n"); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
  await writeFile(join(cwd, "existing.ts"), "dirty before task\n"); const baseline = await captureBaseline(cwd);
  assert.deepEqual(await changedFiles(cwd, baseline), []);
  await writeFile(join(cwd, "existing.ts"), "changed during task\n");
  assert.deepEqual((await changedFiles(cwd, baseline)).map((file) => file.path), ["existing.ts"]);
}));

test("indexes tracked and untracked files once with classified metadata", () => fixture(async (cwd) => {
  await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
  await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src/client.test.ts"), ""); await writeFile(join(cwd, "package.json"), "{}"); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
  await writeFile(join(cwd, "src/new.ts"), "new\n");
  const index = await createRepoIndex(cwd);
  assert.equal(index.mode, "git"); assert.deepEqual(index.tests, ["src/client.test.ts"]); assert.ok(index.configs.includes("package.json")); assert.ok(index.dirty.includes("src/new.ts"));
}));

test("excludes Gauntlet's own state from subsequent task indexes", () => fixture(async (cwd) => {
  await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
  await writeFile(join(cwd, "source.ts"), "source\n"); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd); await mkdir(join(cwd, ".gauntlet")); await writeFile(join(cwd, ".gauntlet/state.test.ts"), "internal\n");
  const index = await createRepoIndex(cwd); assert.equal(index.files.some((path) => path.startsWith(".gauntlet/")), false); assert.deepEqual(index.tests, []); assert.deepEqual(index.dirty, []);
}));

test("fingerprints only ambiguous dirty files in a Git baseline", () => fixture(async (cwd) => {
  await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
  await Promise.all(Array.from({ length: 200 }, (_, index) => writeFile(join(cwd, `file-${index}.ts`), "clean\n"))); await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
  const clean = await captureBaseline(cwd); assert.deepEqual(clean.files, {});
  await writeFile(join(cwd, "file-1.ts"), "dirty\n"); const dirty = await captureBaseline(cwd); assert.deepEqual(Object.keys(dirty.files), ["file-1.ts"]);
  await writeFile(join(cwd, "file-1.ts"), "clean\n"); assert.deepEqual((await changedFiles(cwd, dirty)).map((item) => item.path), ["file-1.ts"]);
}));

test("filesystem fallback detects files added after the baseline", () => fixture(async (cwd) => {
  await writeFile(join(cwd, "before.ts"), "before\n"); const baseline = await captureBaseline(cwd); await writeFile(join(cwd, "after.ts"), "after\n");
  assert.equal(baseline.index?.mode, "filesystem"); assert.deepEqual((await changedFiles(cwd, baseline)).map((item) => item.path), ["after.ts"]);
}));

test("ranks explicit paths and bounds context", () => fixture(async (cwd) => {
  await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src", "retry.ts"), ""); await writeFile(join(cwd, "src", "other.ts"), "");
  const packet = await selectContext(cwd, contract("Fix src/retry.ts", { explicitPaths: ["src/retry.ts"], expectedFrontier: ["src/retry.ts"] }), 1);
  assert.equal(packet.entries[0]?.path, "src/retry.ts"); assert.equal(packet.entries.length, 1);
}));

test("injects only applicable instructions in precedence order", () => fixture(async (cwd) => {
  await mkdir(join(cwd, "src/feature"), { recursive: true }); await mkdir(join(cwd, "other"));
  await writeFile(join(cwd, "AGENTS.md"), "root rule"); await writeFile(join(cwd, "src/AGENTS.md"), "src rule"); await writeFile(join(cwd, "other/AGENTS.md"), "other rule"); await writeFile(join(cwd, "src/feature/task.ts"), "");
  const packet = await selectContext(cwd, contract("Fix src/feature/task.ts", { explicitPaths: ["src/feature/task.ts"], expectedFrontier: ["src/feature/task.ts"] }));
  assert.deepEqual(packet.instructions.map((value) => value.split(":")[0]), ["AGENTS.md", "src/AGENTS.md"]); assert.match(formatContext(packet), /root rule[\s\S]*src rule/); assert.doesNotMatch(formatContext(packet), /other rule/);
}));

test("formats the valid execution path without raw history", () => fixture(async (cwd) => {
  await writeFile(join(cwd, "source.ts"), "export const value = 1\n");
  const execution: ActiveExecutionContext = { task: "Fix behavior", acceptanceCriteria: [], constraints: [], validatedState: ["Cause established"], current: "Reuse existing primitive", relevantFiles: ["source.ts"], relevantSymbols: [], proofRefs: ["proof/test.log"], open: ["regression"] };
  const packet = await selectContext(cwd, contract(execution.task, { explicitPaths: ["source.ts"], expectedFrontier: ["source.ts"] })); packet.execution = execution;
  const formatted = formatContext(packet); assert.match(formatted, /Validated: Cause established/); assert.match(formatted, /Open: regression/); assert.match(formatted, /proof\/test\.log/);
}));

test("ranks direct imports and corresponding tests after the explicit target", () => fixture(async (cwd) => {
  await mkdir(join(cwd, "src"));
  await writeFile(join(cwd, "src/retry.ts"), "import { wait } from './wait.js'; export const retry = wait"); await writeFile(join(cwd, "src/wait.ts"), "export const wait = 1"); await writeFile(join(cwd, "src/retry.test.ts"), "import { retry } from './retry.js'; test('retry', () => retry)");
  const packet = await selectContext(cwd, contract("Change src/retry.ts", { explicitPaths: ["src/retry.ts"], expectedFrontier: ["src/retry.ts"] }));
  assert.equal(packet.entries[0]?.path, "src/retry.ts"); assert.ok(packet.entries.some((entry) => entry.path === "src/wait.ts" && entry.reason.includes("imported"))); assert.ok(packet.entries.some((entry) => entry.path === "src/retry.test.ts" && entry.reason.includes("tests")));
}));
