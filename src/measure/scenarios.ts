import { initialUncertainty } from "../control/uncertainty.js";
import { selectInterventions } from "../control/selector.js";
import { selectMarginal } from "../context/marginality.js";
import { activePath, rejectBranch, type ExecutionCheckpoint } from "../execution-state/checkpoints.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../core/policy.js";
import type { EvalResult } from "./evals.js";
import { extractContract } from "../core/intent.js";
import { detectAmbiguity } from "../core/intent.js";
import { assessProgress } from "../execution-state/progress.js";
import { assessScope } from "../intelligence/scope.js";
import { compileRules } from "../repo/rules.js";
import { decideCompletion } from "../verify/completion.js";
import { requiredCapabilities } from "../control/capabilities.js";
import { createControlState, createTaskWorld, type TaskState } from "../core/task-state.js";
import { boundaryDecision } from "../control/runtime.js";

export function runIntelligenceEvals(): EvalResult[] {
  const started = performance.now(), uncertainty = initialUncertainty(extractContract("Fix refresh race"), "elevated");
  const trace = selectInterventions({ uncertainty, candidates: [{ id: "local-search", uncertainty: "cause", level: 2, cost: "tiny", available: true }, { id: "external-docs", uncertainty: "cause", level: 4, cost: "medium", available: true }], supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "eval" });
  const root = point("root", "task", "validated"), rejected = { ...point("bad", "implementation", "active"), parentId: "root" }, replacement = { ...point("good", "implementation", "active"), parentId: "root" };
  const tree = rejectBranch([root, rejected], "bad", replacement, "duplicates repository primitive"), path = activePath(tree, "good");
  const marginal = selectMarginal([{ value: "owner", contributions: ["owner:session" as const], cost: 1 }, { value: "duplicate", contributions: ["owner:session" as const], cost: 1 }, { value: "test", contributions: ["acceptance:race" as const], cost: 1 }], 2);
  const state = task("Implement responsive behavior in ui.tsx"), visual = requiredCapabilities(state); state.control.context.pressure = "unknown";
  const stalled = assessProgress({ events: [{ index: 0, type: "failure", target: "test", outcome: "fail" }, { index: 1, type: "failure", target: "test", outcome: "fail" }], checkpoints: state.control.execution.checkpoints, activeCheckpointId: state.control.execution.activeCheckpointId, uncertainty: state.control.uncertainty });
  const scope = assessScope(state.contract, [{ path: "src/security/schema.ts", added: 1, removed: 0 }], [], [], undefined), rules = compileRules([{ id: "architecture.layers", category: "architecture", value: "routes use services", strength: "strong", scope: ".", sourceRefs: [], representatives: [] }]);
  const completion = decideCompletion(state.contract, [], state.control.uncertainty, ["diff"]), ambiguity = detectAmbiguity(extractContract("Use the appropriate public API behavior")), boundary = boundaryDecision(state, "activity");
  return [
    result("negative-routing", "selection", trace.selected.length === 1 && trace.rejected.some((item) => item.id === "external-docs" && item.reason === "dominated"), started, trace.selected.length, [`selected: ${trace.selected.join()}`]),
    result("rejected-branch-quarantine", "execution-state", path.every((item) => item.id !== "bad") && tree.some((item) => item.id === "bad" && item.status === "rejected"), started, 0, [`active path: ${path.map((item) => item.id).join(" -> ")}`]),
    { ...result("marginal-context", "context", marginal.selected.join() === "owner,test", started, 0, [`selected: ${marginal.selected.join()}`]), contextItems: marginal.selected.length },
    result("stall-routing", "execution-state", stalled.status === "STALLED", started, 1, [JSON.stringify(stalled)]),
    result("scope-boundary", "enforcement", scope.hardSignals.length === 1, started, 0, scope.hardSignals),
    result("timed-rule", "enforcement", rules[0]?.timing === "before_stop" && rules[0]?.enforcement === "structural", started, 0, [JSON.stringify(rules[0])]),
    result("focused-clarification", "routing", ambiguity.costly && Boolean(ambiguity.question), started, 1, [JSON.stringify(ambiguity)]),
    result("visual-activation", "domain", visual.length === 1 && visual[0]?.kind === "browser", started, visual.length, [JSON.stringify(visual)]),
    result("boundary-safety", "context", boundary.pressure === "unknown" && !boundary.stable, started, 0, [JSON.stringify(boundary)]),
    result("truthful-stop", "verification", completion.status === "incomplete", started, 0, [JSON.stringify(completion)]),
  ];
}

function task(intent: string): TaskState {
  const contract = extractContract(intent), control = createControlState(contract);
  return { version: 3, id: "eval", repository: process.cwd(), startedAt: new Date(0).toISOString(), contract, clarifications: [], baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: contract.explicitPaths, repositoryFacts: [], activities: [], findings: [], attempts: 1, control, world: createTaskWorld(contract) };
}

function point(id: string, kind: ExecutionCheckpoint["kind"], status: ExecutionCheckpoint["status"]): ExecutionCheckpoint { return { id, kind, status, summary: id, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], proofRefs: [], createdFromEvent: 0, resolves: [] }; }
function result(caseId: string, category: EvalResult["category"], passed: boolean, started: number, interventions: number, proof: string[]): EvalResult { return { category, caseId, passed, durationMs: performance.now() - started, interventions, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof }; }
