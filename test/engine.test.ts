import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GauntletEngine } from "../src/core/engine.js";
import { run } from "../src/repo/process.js";

test("engine executes a task lifecycle against its task-start baseline", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-engine-"));
  try {
    await run("git", ["init"], cwd); await run("git", ["config", "user.email", "test@example.com"], cwd); await run("git", ["config", "user.name", "Test"], cwd);
    await writeFile(join(cwd, "package.json"), JSON.stringify({ scripts: { typecheck: "node -e \"process.exit(0)\"" } }));
    await writeFile(join(cwd, "package-lock.json"), "{}"); await writeFile(join(cwd, "feature.ts"), "const oldValue = 1;\n");
    await run("git", ["add", "."], cwd); await run("git", ["commit", "-m", "base"], cwd);
    await writeFile(join(cwd, "preexisting.ts"), "dirty before task\n");
    const engine = new GauntletEngine(cwd), started = await engine.start("Change feature.ts without adding dependencies", "task-1");
    assert.match(started.injection, /smallest justified/); assert.equal(started.clarification, null);
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
