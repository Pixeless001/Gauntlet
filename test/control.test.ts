import assert from "node:assert/strict";
import test from "node:test";
import { initialUncertainty } from "../src/control/uncertainty.js";
import { selectInterventions } from "../src/control/selector.js";
import { activePath, rejectBranch, type ExecutionCheckpoint } from "../src/execution-state/checkpoints.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../src/core/policy.js";

test("selector chooses the cheapest relevant intervention and explains rejection", () => {
  const uncertainty = initialUncertainty({ intent: "Fix auth race", acceptanceCriteria: [], explicitPaths: [], constraints: [] }, "elevated");
  const trace = selectInterventions({ uncertainty, supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 2, trigger: "failure", candidates: [
    { id: "docs", uncertainty: "cause", level: 4, cost: "medium", available: true },
    { id: "search", uncertainty: "cause", level: 2, cost: "tiny", available: true },
    { id: "browser", uncertainty: "visual", level: 4, cost: "medium", available: true },
  ] });
  assert.deepEqual(trace.selected, ["search"]);
  assert.deepEqual(trace.rejected, [{ id: "browser", reason: "irrelevant" }, { id: "docs", reason: "dominated" }]);
});

test("execution branches preserve rejected work outside the active path", () => {
  const root: ExecutionCheckpoint = { id: "root", kind: "task", status: "validated", summary: "task", constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], evidenceRefs: [], createdFromEvent: 0, resolves: [] };
  const first: ExecutionCheckpoint = { ...root, id: "first", parentId: "root", kind: "implementation", status: "active", summary: "first" };
  const second: ExecutionCheckpoint = { ...first, id: "second", summary: "second" };
  const checkpoints = rejectBranch([root, first], "first", second, "duplicate primitive");
  assert.deepEqual(activePath(checkpoints, "second").map((item) => item.id), ["root", "second"]);
  assert.equal(checkpoints.find((item) => item.id === "first")?.rejectionReason, "duplicate primitive");
});
