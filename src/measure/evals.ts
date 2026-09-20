export type EvalCategory = "routing" | "behavior" | "enforcement" | "context" | "verification" | "overhead" | "domain" | "portability" | "execution-state" | "intelligence" | "selection" | "memory";
export interface EvalResult {
  category: EvalCategory; caseId: string; passed: boolean; durationMs: number; interventions: number; extraModelCalls: number;
  contextItems: number; repeatedReads: number; rawOutputBytes: number; conditionedOutputBytes: number; proof: string[];
  graphExpansions?: number; externalDocCalls?: number; browserActivations?: number; delegations?: number; checkpoints?: number; rejectedBranches?: number;
  firstPassOutcome?: boolean; visibleBytes?: number; depth?: number; stateChanges?: number; proofYield?: number; capabilityUse?: number; checkpointQuality?: number;
}
export interface EvalComparison { caseId: string; baseline: EvalResult; candidate: EvalResult; cleanFirstPassImproved: boolean; overheadMs: number; contextItemsSaved: number }
export interface SelectionQuality { falseActivationRate: number; missedActivationRate: number; duplicateInterventionRate: number; averageActivations: number; averageDepth: number; localRate: number; silentRate: number; stateChangeRate: number; proofYieldRate: number }
export interface InterventionOutcome { activated: boolean; expected: boolean; duplicate: boolean; changedState: boolean; proofFound?: boolean; level?: 0 | 1 | 2 | 3 | 4 | 5 }
export interface InterventionRoi { activations: number; actionable: number; stateChanges: number; proofYieldRate: number; stateChangeRate: number }
export interface MemoryEfficiency { rawEvents: number; checkpoints: number; activePath: number; rejectedBranches: number; contextTokens: number; tokensRemoved: number; rejectedApproachRepeats: number }
export interface RepositoryIntelligenceMetrics { startupMs: number; incrementalMs: number; symbols: number; edgesUsed: number; impactQueries: number; affectedTestPrecision: number; capabilitiesDiscovered: number; ruleViolations: number }

export function silenceResult(caseId: string, durationMs: number, values: Partial<EvalResult> = {}): EvalResult {
  return { category: "overhead", caseId, passed: true, durationMs, interventions: 0, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [], ...values };
}

export function compareEval(baseline: EvalResult, candidate: EvalResult): EvalComparison {
  if (baseline.caseId !== candidate.caseId) throw new Error("Cannot compare different eval cases");
  return { caseId: baseline.caseId, baseline, candidate, cleanFirstPassImproved: !baseline.passed && candidate.passed, overheadMs: candidate.durationMs - baseline.durationMs, contextItemsSaved: baseline.contextItems - candidate.contextItems };
}

export function eligibleForPromotion(results: EvalComparison[], maxFalseActivationRate = 0.05, maxOverheadMs = 250): boolean {
  if (results.length < 3) return false;
  const improved = results.filter((result) => result.cleanFirstPassImproved).length, regressions = results.filter((result) => result.baseline.passed && !result.candidate.passed).length;
  const falseActivations = results.filter((result) => result.candidate.interventions > 0 && result.candidate.category === "overhead").length;
  return improved > 0 && regressions === 0 && results.every((result) => result.overheadMs <= maxOverheadMs) && falseActivations / results.length <= maxFalseActivationRate;
}

export function selectionQuality(outcomes: InterventionOutcome[]): SelectionQuality {
  if (!outcomes.length) return { falseActivationRate: 0, missedActivationRate: 0, duplicateInterventionRate: 0, averageActivations: 0, averageDepth: 0, localRate: 1, silentRate: 1, stateChangeRate: 0, proofYieldRate: 0 };
  const count = (predicate: (item: InterventionOutcome) => boolean) => outcomes.filter(predicate).length;
  const activated = outcomes.filter((item) => item.activated), levels = activated.map((item) => item.level ?? 0);
  return { falseActivationRate: count((item) => item.activated && !item.expected) / outcomes.length, missedActivationRate: count((item) => !item.activated && item.expected) / outcomes.length, duplicateInterventionRate: count((item) => item.duplicate) / outcomes.length, averageActivations: activated.length / outcomes.length, averageDepth: levels.reduce<number>((sum, level) => sum + level, 0) / Math.max(1, levels.length), localRate: activated.filter((item) => (item.level ?? 0) <= 2).length / Math.max(1, activated.length), silentRate: count((item) => !item.activated) / outcomes.length, stateChangeRate: count((item) => item.activated && item.changedState) / Math.max(1, activated.length), proofYieldRate: count((item) => item.activated && item.proofFound === true) / Math.max(1, activated.length) };
}

export function interventionRoi(outcomes: InterventionOutcome[]): InterventionRoi {
  const activated = outcomes.filter((item) => item.activated), actionable = activated.filter((item) => item.proofFound).length, stateChanges = activated.filter((item) => item.changedState).length;
  return { activations: activated.length, actionable, stateChanges, proofYieldRate: actionable / Math.max(1, activated.length), stateChangeRate: stateChanges / Math.max(1, activated.length) };
}
