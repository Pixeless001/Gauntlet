import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractContract } from "../core/intent.js";
import { assessRisk } from "../core/risk.js";
import { routeSkills } from "../core/skills.js";
import type { EvalResult } from "./evals.js";
import { runIntelligenceEvals } from "./scenarios.js";
import { ARCHITECTURE_FIXTURES } from "./fixtures.js";
import { createRepoIndex } from "../repo/index.js";
import { buildStructuralIndex } from "../intelligence/index.js";
import { inspectImpact } from "../intelligence/working-graph.js";
import { initialUncertainty } from "../control/uncertainty.js";
import { selectInterventions } from "../control/selector.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../core/policy.js";

export const evalSuites = ["decisions", "repository", "ablation", "interaction", "replay"] as const;
export type EvalSuite = typeof evalSuites[number];

const cases = [
  { id: "silence-readme", intent: "Fix README typo", expected: [] },
  { id: "silence-rename", intent: "Rename a local variable", expected: [] },
  { id: "route-failure", intent: "Investigate intermittent crash", expected: ["investigate"] },
  { id: "route-performance", intent: "Optimize request latency", expected: ["optimize"] },
] as const;

export function runBuiltInEvals(): EvalResult[] {
  const architecture = ARCHITECTURE_FIXTURES.map((item) => {
    const started = performance.now(), contract = extractContract(item.intent), actual = routeSkills(contract, "start", assessRisk(contract).level), passed = actual.join() === item.expectedSkills.join();
    return { category: item.expectedSkills.length ? "routing" as const : "overhead" as const, caseId: `architecture:${item.id}`, passed, durationMs: performance.now() - started, interventions: actual.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`acceptance: ${item.acceptance.join("; ")}`, `preservation: ${item.preservation.join("; ")}`, `expected: ${item.expectedSkills.join() || "none"}`, `actual: ${actual.join() || "none"}`, `sufficient proof: ${item.sufficientProof.join(", ")}`, `stop: ${item.stopCondition}`] };
  });
  return [...cases.map((item) => {
    const started = performance.now(), contract = extractContract(item.intent), actual = routeSkills(contract, "start", assessRisk(contract).level), passed = actual.join() === item.expected.join();
    return { category: item.id.startsWith("silence") ? "overhead" as const : "routing" as const, caseId: item.id, passed, durationMs: performance.now() - started, interventions: actual.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`expected: ${item.expected.join() || "none"}`, `actual: ${actual.join() || "none"}`] };
  }), ...architecture, ...runIntelligenceEvals()];
}

export async function runEvalSuite(suite: EvalSuite): Promise<EvalResult[]> {
  if (suite === "decisions") return runBuiltInEvals();
  if (suite === "repository") return runRepositorySuite();
  const contract = extractContract("Fix a request race"), uncertainty = initialUncertainty(contract, "elevated");
  if (suite === "replay") {
    const events = [{ event: 0, supplied: [] as string[] }, { event: 1, supplied: ["local-search"] }];
    return events.map((event) => { const started = performance.now(), trace = selectInterventions({ uncertainty, supplied: event.supplied, budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: event.event, trigger: "replay", candidates: [{ id: "local-search", kind: "proof", uncertainty: "cause", level: 1, cost: "tiny", authority: "repository", available: true }] }); return { category: "selection", caseId: `replay:${event.event}`, passed: event.event === 0 ? trace.selected.length === 1 : trace.rejected[0]?.reason === "duplicate", durationMs: performance.now() - started, interventions: trace.selected.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, stateChanges: trace.selected.length, proofYield: trace.selected.length, proof: [JSON.stringify(trace)] }; });
  }
  if (suite === "ablation") {
    const candidates = [{ id: "local-search", kind: "proof" as const, uncertainty: "cause" as const, level: 1 as const, cost: "tiny" as const, authority: "repository" as const, available: true }];
    const enabled = selectInterventions({ uncertainty, candidates, supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "ablation" });
    const disabled = selectInterventions({ uncertainty, candidates: [], supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "ablation" });
    return [{ category: "selection", caseId: "ablation:local-routing", passed: enabled.selected.length === 1 && disabled.selected.length === 0, durationMs: 0, interventions: enabled.selected.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`enabled:${enabled.selected.length}`, `disabled:${disabled.selected.length}`] }];
  }
  const trace = selectInterventions({ uncertainty, supplied: [], budget: { ...DEFAULT_INTERVENTION_BUDGET, interventions: 2 }, used: 0, event: 0, trigger: "interaction", candidates: [{ id: "path", kind: "context", uncertainty: "cause", level: 1, cost: "tiny", authority: "runtime", contributions: ["cause:path"], available: true }, { id: "test", kind: "proof", uncertainty: "cause", level: 1, cost: "tiny", authority: "repository", contributions: ["cause:failure"], available: true }] });
  return [{ category: "selection", caseId: "interaction:context-proof", passed: trace.selected.length === 2, durationMs: 0, interventions: trace.selected.length, extraModelCalls: 0, contextItems: 1, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: trace.selected }];
}

async function runRepositorySuite(): Promise<EvalResult[]> {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-eval-")), started = performance.now();
  try {
    await writeFile(join(cwd, "owner.ts"), "export const owner = 1;\n"); await writeFile(join(cwd, "caller.ts"), "import { owner } from './owner.js'; export const caller = owner;\n"); await writeFile(join(cwd, "owner.test.ts"), "test('owner', () => {});\n");
    const repository = await createRepoIndex(cwd), index = await buildStructuralIndex(cwd, repository), result = inspectImpact(index, "owner.ts");
    return [{ category: "intelligence", caseId: "repository:impact", passed: result.callers.includes("caller.ts") && result.tests.includes("owner.test.ts"), durationMs: performance.now() - started, interventions: 0, extraModelCalls: 0, contextItems: Object.keys(index.files).length, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [JSON.stringify(result)] }];
  } finally { await rm(cwd, { recursive: true, force: true }); }
}

export async function saveEvalRun(cwd: string, results: EvalResult[]): Promise<string> {
  const directory = join(cwd, ".gauntlet", "evals", "results"), name = `${new Date().toISOString().replaceAll(":", "-")}.json`, path = join(directory, name), temporary = `${path}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(temporary, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, path); return path;
}
