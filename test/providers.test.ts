import assert from "node:assert/strict";
import test from "node:test";
import { resolveDomains } from "../src/domains/resolver.js";
import { silenceResult } from "../src/measure/evals.js";

const profile = { packageManager: "npm", language: ["typescript"], dependencies: ["react"], commands: [], harnesses: [] };
test("detected domains remain inactive for unrelated work", () => {
  assert.deepEqual(resolveDomains(profile, { intent: "fix README typo", acceptanceCriteria: [], constraints: [], explicitPaths: [] }), { detected: ["react", "ui"], active: [] });
  assert.deepEqual(resolveDomains(profile, { intent: "improve React render performance", acceptanceCriteria: [], constraints: [], explicitPaths: [] }).active, ["react"]);
});

test("typescript alone does not pretend React or UI capability exists", () => {
  const plain = { ...profile, dependencies: [] };
  assert.deepEqual(resolveDomains(plain, { intent: "change a component", acceptanceCriteria: [], constraints: [], explicitPaths: [] }), { detected: [], active: [] });
});

test("silence evaluations expose concrete overhead measures", () => {
  const result = silenceResult("rename", 2); assert.equal(result.passed, true); assert.equal(result.interventions, 0); assert.equal(result.extraModelCalls, 0);
});
