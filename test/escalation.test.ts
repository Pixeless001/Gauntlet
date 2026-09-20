import assert from "node:assert/strict";
import test from "node:test";
import { capabilityCandidates, requiredCapabilities } from "../src/control/capabilities.js";
import { planActivation } from "../src/control/selector.js";
import { compactBrowserProof } from "../src/context/browser.js";
import { createDelegatedTask, verifyDelegatedResult } from "../src/execution-state/delegation.js";
import type { TaskState } from "../src/core/task-state.js";

const task = (): TaskState => ({ version: 1, id: "x", repository: "/repo", startedAt: new Date().toISOString(), contract: { intent: "Fix README typo", acceptanceCriteria: [], explicitPaths: ["README.md"], constraints: [] }, baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: ["README.md"], repositoryFacts: [], activities: [], findings: [], attempts: 1, session: { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: [], lastCompactedActivity: 0, compactions: 0, budget: { interventions: 2, compactions: 1, expensiveChecks: 1, skillInvocations: 1, extraLlmCalls: 0 }, observations: [], repeatReadsDetected: 0, uncertainty: { intent: "resolved", location: "resolved", cause: "irrelevant", repoFit: "irrelevant", api: "irrelevant", behavior: "irrelevant", regression: "irrelevant", scope: "resolved", visual: "irrelevant", performance: "irrelevant" } } });

test("expensive capabilities stay silent without matching uncertainty", () => { assert.deepEqual(requiredCapabilities(task()), []); });
test("visual uncertainty selects browser without selecting delegation", () => { const value = task(); value.session!.uncertainty!.visual = "open"; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["browser"]); });
test("documentation waits until local API proof is exhausted", () => { const value = task(); value.session!.uncertainty!.api = "open"; assert.deepEqual(requiredCapabilities(value), []); value.session!.exhaustedEscalation = { api: 3 }; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["docs"]); });
test("capabilities remain candidates until control confirms availability", () => {
  const value = task(); value.session!.uncertainty!.visual = "open";
  const unavailable = capabilityCandidates(value), rejected = planActivation({ uncertainty: value.session!.uncertainty!, candidates: unavailable, supplied: [], budget: value.session!.budget, used: 0, event: 0, trigger: "test" });
  assert.equal(rejected.trace.rejected[0]?.reason, "unavailable");
  const selected = planActivation({ uncertainty: value.session!.uncertainty!, candidates: capabilityCandidates(value, { browser: true }), supplied: [], budget: value.session!.budget, used: 0, event: 0, trigger: "test" });
  assert.deepEqual(selected.capabilities.map((item) => item.id), ["capability:browser"]);
});
test("browser proof removes duplicate noise and remains bounded", () => { const compact = compactBrowserProof({ text: [" Save ", "Save"], controls: [{ role: "button", name: "Save" }, { role: "button", name: "Save" }], consoleFailures: ["boom", "boom"], networkFailures: [], screenshot: "shot" }); assert.deepEqual(compact.text, ["Save"]); assert.equal(compact.controls.length, 1); assert.deepEqual(compact.failures, ["boom"]); });
test("delegated task contains active state rather than event history", () => { const value = task(); const delegated = createDelegatedTask(value); assert.equal(delegated.goal, "Fix README typo"); assert.deepEqual(delegated.relevantFiles, ["README.md"]); assert.equal("activities" in delegated, false); });
test("parent verification rejects unsupported or out-of-scope delegated completion", () => {
  const delegated = createDelegatedTask(task());
  assert.deepEqual(verifyDelegatedResult(delegated, { status: "complete", result: "done", proof: [], changedFiles: ["other.ts"] }), { acceptable: false, reasons: ["Delegated completion has no proof", "Delegated changes exceeded scope: other.ts"] });
  assert.equal(verifyDelegatedResult(delegated, { status: "complete", result: "done", proof: ["test:pass"], changedFiles: ["README.md"] }).acceptable, true);
});
