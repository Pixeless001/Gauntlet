import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuiltInEvals, saveEvalRun } from "../src/measure/eval-runner.js";

test("built-in routing and silence evals persist concrete evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-evals-"));
  try { const results = runBuiltInEvals(); assert.equal(results.every((item) => item.passed), true); const path = await saveEvalRun(cwd, results); assert.deepEqual(JSON.parse(await readFile(path, "utf8")), results); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});
