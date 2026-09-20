import assert from "node:assert/strict";
import test from "node:test";
import { domainCandidates, resolveDomains } from "../src/domains/resolver.js";
import { planActivation } from "../src/control/selector.js";
import { initialUncertainty } from "../src/control/uncertainty.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../src/core/policy.js";
import { compareEval, eligibleForPromotion, silenceResult } from "../src/measure/evals.js";
import { contract } from "./support.js";

const profile = { packageManager: "npm", language: ["typescript"], dependencies: ["react"], commands: [], harnesses: [] };
test("detected domains remain inactive for unrelated work", () => {
  assert.deepEqual(resolveDomains(profile, contract("fix README typo")), { detected: ["react", "ui"], active: [] });
  assert.deepEqual(resolveDomains(profile, contract("improve React render performance")).active, ["react"]);
});

test("typescript alone does not pretend React or UI capability exists", () => {
  const plain = { ...profile, dependencies: [] };
  assert.deepEqual(resolveDomains(plain, contract("change a component")), { detected: [], active: [] });
});

test("domain detection proposes references without forcing activation", () => {
  const taskContract = contract("improve React render performance"), uncertainty = initialUncertainty(taskContract, "ordinary");
  const unavailable = domainCandidates(profile, taskContract), rejected = planActivation({ uncertainty, candidates: unavailable, supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "test" });
  assert.deepEqual(rejected.references, []); assert.ok(rejected.trace.rejected.every((item) => item.reason === "unavailable" || item.reason === "irrelevant"));
  const selected = planActivation({ uncertainty, candidates: domainCandidates(profile, taskContract, { react: true }), supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "test" });
  assert.deepEqual(selected.references.map((item) => item.id), ["reference:react"]);
});

test("silence evaluations expose concrete overhead measures", () => {
  const result = silenceResult("rename", 2); assert.equal(result.passed, true); assert.equal(result.interventions, 0); assert.equal(result.extraModelCalls, 0);
});

test("promotion requires measured improvement without regressions", () => {
  const candidate = (caseId: string, passed: boolean) => silenceResult(caseId, 2, { category: "behavior", passed });
  const results = ["a", "b", "c"].map((id, index) => compareEval(candidate(id, index !== 0), candidate(id, true)));
  assert.equal(eligibleForPromotion(results), true);
  assert.equal(eligibleForPromotion(results.slice(0, 2)), false);
  const regressed = [...results.slice(0, 2), compareEval(candidate("c", true), candidate("c", false))];
  assert.equal(eligibleForPromotion(regressed), false);
});
