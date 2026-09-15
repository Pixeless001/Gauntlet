import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuiltInEvals, saveEvalRun } from "../src/measure/eval-runner.js";
import { selectionQuality } from "../src/measure/evals.js";

test("built-in routing and silence evals persist concrete evidence", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-evals-"));
  try { const results = runBuiltInEvals(); assert.equal(results.every((item) => item.passed), true); const path = await saveEvalRun(cwd, results); assert.deepEqual(JSON.parse(await readFile(path, "utf8")), results); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("built-in evaluations cover restraint, active paths, and marginal context", () => {
  const results = runBuiltInEvals(); assert.equal(results.every((item) => item.passed), true); assert.deepEqual(results.slice(-3).map((item) => item.caseId), ["negative-routing", "rejected-branch-quarantine", "marginal-context"]);
});

test("selection quality reports activation, silence, and state-change rates separately", () => {
  assert.deepEqual(selectionQuality([{ activated: true, expected: true, duplicate: false, changedState: true }, { activated: false, expected: false, duplicate: false, changedState: false }]), { falseActivationRate: 0, missedActivationRate: 0, duplicateInterventionRate: 0, averageActivations: 0.5, silentRate: 0.5, stateChangeRate: 1 });
});
