import { initialUncertainty } from "../control/uncertainty.js";
import { selectInterventions } from "../control/selector.js";
import { selectMarginal } from "../context/marginality.js";
import { activePath, rejectBranch, type ExecutionCheckpoint } from "../execution-state/checkpoints.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../core/policy.js";
import type { EvalResult } from "./evals.js";

export function runIntelligenceEvals(): EvalResult[] {
  const started = performance.now(), uncertainty = initialUncertainty({ intent: "Fix refresh race", acceptanceCriteria: [], explicitPaths: [], constraints: [] }, "elevated");
  const trace = selectInterventions({ uncertainty, candidates: [{ id: "local-search", uncertainty: "cause", level: 2, cost: "tiny", available: true }, { id: "external-docs", uncertainty: "cause", level: 4, cost: "medium", available: true }], supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "eval" });
  const root = point("root", "task", "validated"), rejected = { ...point("bad", "implementation", "active"), parentId: "root" }, replacement = { ...point("good", "implementation", "active"), parentId: "root" };
  const tree = rejectBranch([root, rejected], "bad", replacement, "duplicates repository primitive"), path = activePath(tree, "good");
  const marginal = selectMarginal([{ value: "owner", contributions: ["owner:session" as const], cost: 1 }, { value: "duplicate", contributions: ["owner:session" as const], cost: 1 }, { value: "test", contributions: ["acceptance:race" as const], cost: 1 }], 2);
  return [
    result("negative-routing", "selection", trace.selected.length === 1 && trace.rejected.some((item) => item.id === "external-docs" && item.reason === "dominated"), started, trace.selected.length, [`selected: ${trace.selected.join()}`]),
    result("rejected-branch-quarantine", "execution-state", path.every((item) => item.id !== "bad") && tree.some((item) => item.id === "bad" && item.status === "rejected"), started, 0, [`active path: ${path.map((item) => item.id).join(" -> ")}`]),
    { ...result("marginal-context", "context", marginal.selected.join() === "owner,test", started, 0, [`selected: ${marginal.selected.join()}`]), contextItems: marginal.selected.length },
  ];
}

function point(id: string, kind: ExecutionCheckpoint["kind"], status: ExecutionCheckpoint["status"]): ExecutionCheckpoint { return { id, kind, status, summary: id, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], proofRefs: [], createdFromEvent: 0, resolves: [] }; }
function result(caseId: string, category: EvalResult["category"], passed: boolean, started: number, interventions: number, proof: string[]): EvalResult { return { category, caseId, passed, durationMs: performance.now() - started, interventions, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof }; }
