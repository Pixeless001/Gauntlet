export type EvalCategory = "routing" | "behavior" | "enforcement" | "context" | "verification" | "overhead" | "domain" | "portability" | "execution-state" | "intelligence" | "selection" | "memory" | "orchestration";
export interface EvalResult {
    category: EvalCategory;
    caseId: string;
    passed: boolean;
    durationMs: number;
    interventions: number;
    extraModelCalls: number;
    contextItems: number;
    repeatedReads: number;
    rawOutputBytes: number;
    conditionedOutputBytes: number;
    proof: string[];
    graphExpansions?: number;
    externalDocCalls?: number;
    browserActivations?: number;
    delegations?: number;
    checkpoints?: number;
    rejectedBranches?: number;
    firstPassOutcome?: boolean;
    visibleBytes?: number;
    depth?: number;
    stateChanges?: number;
    proofYield?: number;
    capabilityUse?: number;
    checkpointQuality?: number;
}
export interface EvalComparison {
    caseId: string;
    baseline: EvalResult;
    candidate: EvalResult;
    cleanFirstPassImproved: boolean;
    overheadMs: number;
    contextItemsSaved: number;
}
export interface SelectionQuality {
    falseActivationRate: number;
    missedActivationRate: number;
    duplicateInterventionRate: number;
    averageActivations: number;
    averageDepth: number;
    localRate: number;
    silentRate: number;
    stateChangeRate: number;
    proofYieldRate: number;
}
export interface InterventionOutcome {
    activated: boolean;
    expected: boolean;
    duplicate: boolean;
    changedState: boolean;
    proofFound?: boolean;
    level?: 0 | 1 | 2 | 3 | 4 | 5;
}
export interface InterventionRoi {
    activations: number;
    actionable: number;
    stateChanges: number;
    proofYieldRate: number;
    stateChangeRate: number;
}
export interface MemoryEfficiency {
    rawEvents: number;
    checkpoints: number;
    activePath: number;
    rejectedBranches: number;
    contextTokens: number;
    tokensRemoved: number;
    rejectedApproachRepeats: number;
}
export interface RepositoryIntelligenceMetrics {
    startupMs: number;
    incrementalMs: number;
    symbols: number;
    edgesUsed: number;
    impactQueries: number;
    affectedTestPrecision: number;
    capabilitiesDiscovered: number;
    ruleViolations: number;
}
export declare function silenceResult(caseId: string, durationMs: number, values?: Partial<EvalResult>): EvalResult;
export declare function compareEval(baseline: EvalResult, candidate: EvalResult): EvalComparison;
export declare function eligibleForPromotion(results: EvalComparison[], maxFalseActivationRate?: number, maxOverheadMs?: number): boolean;
export declare function selectionQuality(outcomes: InterventionOutcome[]): SelectionQuality;
export declare function interventionRoi(outcomes: InterventionOutcome[]): InterventionRoi;
