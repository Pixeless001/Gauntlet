import assert from "node:assert/strict";
import test from "node:test";
import { requiredCapabilities } from "../src/control/capabilities.js";
import { compactBrowserEvidence } from "../src/context/browser.js";
import { delegationHandoff, verifyDelegatedResult } from "../src/execution-state/delegation.js";
import type { TaskState } from "../src/core/task-state.js";

const task = (): TaskState => ({ version: 1, id: "x", repository: "/repo", startedAt: new Date().toISOString(), contract: { intent: "Fix README typo", acceptanceCriteria: [], explicitPaths: ["README.md"], constraints: [] }, baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: ["README.md"], repositoryFacts: [], activities: [], findings: [], attempts: 1, session: { currentApproach: "", decisions: [], resolvedIssues: [], unresolvedIssues: [], failedApproaches: [], activeSkills: [], lastCompactedActivity: 0, compactions: 0, budget: { interventions: 2, compactions: 1, expensiveChecks: 1, skillInvocations: 1, extraLlmCalls: 0 }, observations: [], repeatReadsDetected: 0, uncertainty: { intent: "resolved", location: "resolved", cause: "irrelevant", repoFit: "irrelevant", api: "irrelevant", behavior: "irrelevant", regression: "irrelevant", scope: "resolved", visual: "irrelevant", performance: "irrelevant" } } });

test("expensive capabilities stay silent without matching uncertainty", () => { assert.deepEqual(requiredCapabilities(task()), []); });
test("visual uncertainty selects browser without selecting delegation", () => { const value = task(); value.session!.uncertainty!.visual = "open"; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["browser"]); });
test("documentation waits until local API evidence is exhausted", () => { const value = task(); value.session!.uncertainty!.api = "open"; assert.deepEqual(requiredCapabilities(value), []); value.session!.exhaustedEscalation = { api: 3 }; assert.deepEqual(requiredCapabilities(value).map((item) => item.kind), ["docs"]); });
test("browser evidence removes duplicate noise and remains bounded", () => { const compact = compactBrowserEvidence({ text: [" Save ", "Save"], controls: [{ role: "button", name: "Save" }, { role: "button", name: "Save" }], consoleFailures: ["boom", "boom"], networkFailures: [], screenshot: "shot" }); assert.deepEqual(compact.text, ["Save"]); assert.equal(compact.controls.length, 1); assert.deepEqual(compact.failures, ["boom"]); });
test("delegation handoff contains active state rather than event history", () => { const value = task(); const handoff = delegationHandoff(value); assert.equal(handoff.goal, "Fix README typo"); assert.deepEqual(handoff.relevantFiles, ["README.md"]); assert.equal("activities" in handoff, false); });
test("parent verification rejects unsupported or out-of-scope delegated completion", () => {
  const handoff = delegationHandoff(task());
  assert.deepEqual(verifyDelegatedResult(handoff, { status: "complete", result: "done", evidence: [], changedFiles: ["other.ts"] }), { acceptable: false, reasons: ["Delegated completion has no evidence", "Delegated changes exceeded scope: other.ts"] });
  assert.equal(verifyDelegatedResult(handoff, { status: "complete", result: "done", evidence: ["test:pass"], changedFiles: ["README.md"] }).acceptable, true);
});
