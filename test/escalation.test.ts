import assert from "node:assert/strict";
import test from "node:test";
import { capabilityCandidates, requiredCapabilities } from "../src/control/capabilities.js";
import { planActivation } from "../src/control/selector.js";
import { compactBrowserProof } from "../src/context/browser.js";
import { createDelegatedTask, verifyDelegatedResult } from "../src/execution-state/delegation.js";
import { createControlState, type TaskState } from "../src/core/task-state.js";
import { contract } from "./support.js";

const task = (): TaskState => { const taskContract = contract("Fix README typo", { explicitPaths: ["README.md"], expectedFrontier: ["README.md"] }); return { version: 2, id: "x", repository: "/repo", startedAt: new Date().toISOString(), contract: taskContract, clarifications: [], baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: ["README.md"], repositoryFacts: [], activities: [], findings: [], attempts: 1, control: createControlState(taskContract) }; };

test("expensive capabilities stay silent without matching uncertainty", () => { assert.deepEqual(requiredCapabilities(task()), []); });
test("visual uncertainty selects browser without selecting delegation", () => { const value = task(); value.control!.uncertainty!.visual = "open"; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["browser"]); });
test("documentation waits until local API proof is exhausted", () => { const value = task(); value.control!.uncertainty!.api = "open"; assert.deepEqual(requiredCapabilities(value), []); value.control!.exhaustedEscalation = { api: 3 }; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["docs"]); });
test("delegation requires bounded low-conflict work with parallel value", () => { const value = task(); value.attempts = 3; value.control.uncertainty.cause = "open"; value.control.exhaustedEscalation.cause = 4; assert.equal(requiredCapabilities(value).some((item) => item.kind === "delegation"), false); value.control.scope.expected = ["a.ts", "b.ts"]; assert.equal(requiredCapabilities(value).some((item) => item.kind === "delegation"), true); value.control.scope.hardSignals = ["boundary"]; assert.equal(requiredCapabilities(value).some((item) => item.kind === "delegation"), false); });
test("capabilities remain candidates until control confirms availability", () => {
  const value = task(); value.control!.uncertainty!.visual = "open";
  const unavailable = capabilityCandidates(value), rejected = planActivation({ uncertainty: value.control!.uncertainty!, candidates: unavailable, supplied: [], budget: value.control!.budget, used: 0, event: 0, trigger: "test" });
  assert.equal(rejected.trace.rejected[0]?.reason, "unavailable");
  const selected = planActivation({ uncertainty: value.control!.uncertainty!, candidates: capabilityCandidates(value, { browser: true }), supplied: [], budget: value.control!.budget, used: 0, event: 0, trigger: "test" });
  assert.deepEqual(selected.capabilities.map((item) => item.id), ["capability:browser"]);
});
test("browser proof removes duplicate noise and remains bounded", () => { const compact = compactBrowserProof({ text: [" Save ", "Save"], controls: [{ role: "button", name: "Save" }, { role: "button", name: "Save" }], consoleFailures: ["boom", "boom"], networkFailures: [], screenshot: "shot" }); assert.deepEqual(compact.text, ["Save"]); assert.equal(compact.controls.length, 1); assert.deepEqual(compact.failures, ["boom"]); });
test("delegated task contains active state rather than event history", () => { const value = task(); const delegated = createDelegatedTask(value); assert.equal(delegated.goal, "Fix README typo"); assert.deepEqual(delegated.relevantFiles, ["README.md"]); assert.equal("activities" in delegated, false); });
test("parent verification rejects unsupported or out-of-scope delegated completion", () => {
  const delegated = createDelegatedTask(task());
  assert.deepEqual(verifyDelegatedResult(delegated, { status: "complete", result: "done", proof: [], changedFiles: ["other.ts"] }), { acceptable: false, reasons: ["Delegated completion has no proof", "Delegated changes exceeded scope: other.ts"] });
  assert.equal(verifyDelegatedResult(delegated, { status: "complete", result: "done", proof: ["test:pass"], changedFiles: ["README.md"] }).acceptable, true);
});
