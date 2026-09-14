import assert from "node:assert/strict";
import test from "node:test";
import { MAX_AUTOMATIC_CORRECTIONS, DEFAULT_INTERVENTION_BUDGET } from "../src/core/policy.js";
import { assessRisk } from "../src/core/risk.js";
import { routeSkills } from "../src/core/skills.js";

const contract = (intent: string) => ({ intent, acceptanceCriteria: [], constraints: [], explicitPaths: [] });

test("lightweight defaults prohibit extra model calls and repeated correction", () => {
  assert.equal(DEFAULT_INTERVENTION_BUDGET.extraLlmCalls, 0);
  assert.equal(MAX_AUTOMATIC_CORRECTIONS, 1);
});

test("risk and skills are routed deterministically", () => {
  assert.equal(assessRisk(contract("Fix README typo")).level, "minimal");
  assert.equal(assessRisk(contract("Fix authentication race")).level, "elevated");
  assert.deepEqual(routeSkills(contract("Improve request latency"), "start", "elevated"), ["investigate", "optimize"]);
  assert.deepEqual(routeSkills(contract("Add a field"), "before_stop", "ordinary"), ["verify"]);
});
