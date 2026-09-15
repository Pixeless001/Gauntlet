import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conditionOutput } from "../src/output/conditioner.js";
import { storeOutput } from "../src/output/store.js";

const result = { command: "npm test", exitCode: 1, stdout: "boilerplate\nboilerplate\nFAIL auth.test.ts\nExpected 2 received 3\n", stderr: "", durationMs: 1, timedOut: false };

test("conditioning deduplicates noise and preserves actionable failures", () => {
  const value = conditionOutput(result);
  assert.match(value.summary, /FAIL auth\.test\.ts/); assert.match(value.summary, /Expected 2 received 3/);
  assert.ok(value.retainedBytes < value.rawBytes + Buffer.byteLength("npm test: failed (1)"));
});

test("raw evidence retention remains bounded", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-output-"));
  try { for (let index = 0; index < 105; index++) await storeOutput(cwd, { ...result, stdout: String(index) }, "task"); assert.equal((await readdir(join(cwd, ".gauntlet/runs/task/outputs"))).length, 100); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("raw evidence is stored outside task state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-output-"));
  try { const path = await storeOutput(cwd, result, "task-1"); assert.match(await readFile(join(cwd, path), "utf8"), /boilerplate[\s\S]*FAIL/); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});
