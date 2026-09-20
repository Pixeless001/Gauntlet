import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evalSuites, runBuiltInEvals, runEvalSuite, saveEvalRun } from "../src/measure/eval-runner.js";
import { interventionRoi, selectionQuality } from "../src/measure/evals.js";
import { ARCHITECTURE_FIXTURES } from "../src/measure/fixtures.js";

test("built-in routing and silence evals persist concrete proof", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-evals-"));
  try { const results = runBuiltInEvals(); assert.equal(results.every((item) => item.passed), true); const path = await saveEvalRun(cwd, results); assert.deepEqual(JSON.parse(await readFile(path, "utf8")), results); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});

test("every evaluation suite executes structured cases", async () => {
  for (const suite of evalSuites) { const results = await runEvalSuite(suite); assert.ok(results.length > 0); assert.ok(results.every((item) => item.passed && item.proof.length)); }
});

test("built-in evaluations cover restraint, active paths, and marginal context", () => {
  const results = runBuiltInEvals(); assert.equal(results.every((item) => item.passed), true); for (const id of ["negative-routing", "rejected-branch-quarantine", "marginal-context", "stall-routing", "scope-boundary", "timed-rule", "focused-clarification", "visual-activation", "boundary-safety", "truthful-stop"]) assert.ok(results.some((item) => item.caseId === id));
});

test("architecture fixtures cover required hard tasks and explicit stop conditions", () => {
  assert.ok(ARCHITECTURE_FIXTURES.length >= 10 && ARCHITECTURE_FIXTURES.length <= 20);
  assert.equal(new Set(ARCHITECTURE_FIXTURES.map((item) => item.id)).size, ARCHITECTURE_FIXTURES.length);
  assert.ok(ARCHITECTURE_FIXTURES.every((item) => item.acceptance.length && item.preservation.length && item.sufficientProof.length && item.stopCondition));
  const silence = ARCHITECTURE_FIXTURES.filter((item) => item.expectedSkills.length === 0);
  assert.ok(silence.every((item) => item.forbiddenActivations.length === 4 && item.maximumEscalation <= 1));
});

test("selection quality reports activation, silence, and state-change rates separately", () => {
  const outcomes = [{ activated: true, expected: true, duplicate: false, changedState: true, proofFound: true, level: 2 as const }, { activated: false, expected: false, duplicate: false, changedState: false }];
  assert.deepEqual(selectionQuality(outcomes), { falseActivationRate: 0, missedActivationRate: 0, duplicateInterventionRate: 0, averageActivations: 0.5, averageDepth: 2, localRate: 1, silentRate: 0.5, stateChangeRate: 1, proofYieldRate: 1 });
  assert.deepEqual(interventionRoi(outcomes), { activations: 1, actionable: 1, stateChanges: 1, proofYieldRate: 1, stateChangeRate: 1 });
});
