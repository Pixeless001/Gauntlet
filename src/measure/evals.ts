export type EvalCategory = "routing" | "behavior" | "enforcement" | "context" | "verification" | "overhead" | "domain" | "portability" | "execution-state" | "intelligence" | "selection" | "memory";
export interface EvalResult {
  category: EvalCategory; caseId: string; passed: boolean; durationMs: number; interventions: number; extraModelCalls: number;
  contextItems: number; repeatedReads: number; rawOutputBytes: number; conditionedOutputBytes: number; evidence: string[];
  graphExpansions?: number; externalDocCalls?: number; browserActivations?: number; delegations?: number; checkpoints?: number; rejectedBranches?: number;
}
export interface EvalComparison { caseId: string; baseline: EvalResult; candidate: EvalResult; cleanFirstPassImproved: boolean; overheadMs: number; contextItemsSaved: number }

export function silenceResult(caseId: string, durationMs: number, values: Partial<EvalResult> = {}): EvalResult {
  return { category: "overhead", caseId, passed: true, durationMs, interventions: 0, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, evidence: [], ...values };
}

export function compareEval(baseline: EvalResult, candidate: EvalResult): EvalComparison {
  if (baseline.caseId !== candidate.caseId) throw new Error("Cannot compare different eval cases");
  return { caseId: baseline.caseId, baseline, candidate, cleanFirstPassImproved: !baseline.passed && candidate.passed, overheadMs: candidate.durationMs - baseline.durationMs, contextItemsSaved: baseline.contextItems - candidate.contextItems };
}

export function eligibleForPromotion(results: EvalComparison[], maxFalseActivationRate = 0.05): boolean {
  if (results.length < 3) return false;
  const improved = results.filter((result) => result.cleanFirstPassImproved).length, regressions = results.filter((result) => result.baseline.passed && !result.candidate.passed).length;
  const falseActivations = results.filter((result) => result.candidate.interventions > 0 && result.candidate.category === "overhead").length;
  return improved > 0 && regressions === 0 && falseActivations / results.length <= maxFalseActivationRate;
}
