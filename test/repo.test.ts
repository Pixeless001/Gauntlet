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

test("ranks explicit paths and bounds context", () => fixture(async (cwd) => {
  await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src", "retry.ts"), ""); await writeFile(join(cwd, "src", "other.ts"), "");
  const packet = await selectContext(cwd, { intent: "Fix src/retry.ts", explicitPaths: ["src/retry.ts"], acceptanceCriteria: [], constraints: [] }, 1);
  assert.equal(packet.entries[0]?.path, "src/retry.ts"); assert.equal(packet.entries.length, 1);
}));

test("injects only applicable instructions in precedence order", () => fixture(async (cwd) => {
  await mkdir(join(cwd, "src/feature"), { recursive: true }); await mkdir(join(cwd, "other"));
  await writeFile(join(cwd, "AGENTS.md"), "root rule"); await writeFile(join(cwd, "src/AGENTS.md"), "src rule"); await writeFile(join(cwd, "other/AGENTS.md"), "other rule"); await writeFile(join(cwd, "src/feature/task.ts"), "");
  const packet = await selectContext(cwd, { intent: "Fix src/feature/task.ts", explicitPaths: ["src/feature/task.ts"], acceptanceCriteria: [], constraints: [] });
  assert.deepEqual(packet.instructions.map((value) => value.split(":")[0]), ["AGENTS.md", "src/AGENTS.md"]); assert.match(formatContext(packet), /root rule[\s\S]*src rule/); assert.doesNotMatch(formatContext(packet), /other rule/);
}));
