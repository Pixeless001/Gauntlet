export function silenceResult(caseId, durationMs, values = {}) {
    return { category: "overhead", caseId, passed: true, durationMs, interventions: 0, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [], ...values };
}
export function compareEval(baseline, candidate) {
    if (baseline.caseId !== candidate.caseId)
        throw new Error("Cannot compare different eval cases");
    return { caseId: baseline.caseId, baseline, candidate, cleanFirstPassImproved: !baseline.passed && candidate.passed, overheadMs: candidate.durationMs - baseline.durationMs, contextItemsSaved: baseline.contextItems - candidate.contextItems };
}
export function eligibleForPromotion(results, maxFalseActivationRate = 0.05, maxOverheadMs = 250) {
    if (results.length < 3)
        return false;
    const improved = results.filter((result) => result.cleanFirstPassImproved).length, regressions = results.filter((result) => result.baseline.passed && !result.candidate.passed).length;
    const falseActivations = results.filter((result) => result.candidate.interventions > 0 && result.candidate.category === "overhead").length;
    return improved > 0 && regressions === 0 && results.every((result) => result.overheadMs <= maxOverheadMs) && falseActivations / results.length <= maxFalseActivationRate;
}
export function selectionQuality(outcomes) {
    if (!outcomes.length)
        return { falseActivationRate: 0, missedActivationRate: 0, duplicateInterventionRate: 0, averageActivations: 0, averageDepth: 0, localRate: 1, silentRate: 1, stateChangeRate: 0, proofYieldRate: 0 };
    const count = (predicate) => outcomes.filter(predicate).length;
    const activated = outcomes.filter((item) => item.activated), levels = activated.map((item) => item.level ?? 0);
    return { falseActivationRate: count((item) => item.activated && !item.expected) / outcomes.length, missedActivationRate: count((item) => !item.activated && item.expected) / outcomes.length, duplicateInterventionRate: count((item) => item.duplicate) / outcomes.length, averageActivations: activated.length / outcomes.length, averageDepth: levels.reduce((sum, level) => sum + level, 0) / Math.max(1, levels.length), localRate: activated.filter((item) => (item.level ?? 0) <= 2).length / Math.max(1, activated.length), silentRate: count((item) => !item.activated) / outcomes.length, stateChangeRate: count((item) => item.activated && item.changedState) / Math.max(1, activated.length), proofYieldRate: count((item) => item.activated && item.proofFound === true) / Math.max(1, activated.length) };
}
export function interventionRoi(outcomes) {
    const activated = outcomes.filter((item) => item.activated), actionable = activated.filter((item) => item.proofFound).length, stateChanges = activated.filter((item) => item.changedState).length;
    return { activations: activated.length, actionable, stateChanges, proofYieldRate: actionable / Math.max(1, activated.length), stateChangeRate: stateChanges / Math.max(1, activated.length) };
}
