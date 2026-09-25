import { reconstruct } from "../execution-state/reconstruct.js";
export function shouldCompact(state) {
    const activities = state.activities.slice(state.control?.lastCompactedActivity ?? 0);
    const output = activities.reduce((sum, item) => sum + item.outputBytes, 0);
    const reads = activities.filter((item) => item.kind === "file_read");
    const repeatedReads = reads.length - new Set(reads.map((item) => item.target)).size;
    const failures = activities.filter((item) => item.outcome === "fail" && item.target).map((item) => item.target);
    const repeatedFailure = failures.some((target) => failures.filter((item) => item === target).length >= 3);
    const reasons = [output > 500_000 && "large tool output", repeatedReads >= 6 && "repeated file reads", repeatedFailure && "multiple failed attempts"].filter((item) => Boolean(item));
    const measuredPressure = state.control.context.pressure === "rising" || state.control.context.pressure === "high";
    const stableBoundary = state.control.lifecycle.boundary === "medium" || state.control.lifecycle.boundary === "strong";
    return { compact: reasons.length > 0 && measuredPressure && stableBoundary && state.control.compactions < state.control.budget.compactions, reasons };
}
export function compact(state) {
    const active = reconstruct(state);
    return {
        task: active.task,
        goal: state.contract.goal,
        acceptanceCriteria: active.acceptanceCriteria,
        preservationRequirements: [...state.contract.preservationRequirements],
        constraints: active.constraints,
        repoConstraints: (state.conventions ?? []).filter((fact) => fact.strength === "strong").slice(0, 3).map((fact) => `${fact.id}: ${fact.value}`),
        workingSet: active.relevantFiles.length ? active.relevantFiles : [...state.workingSet],
        currentApproach: active.current,
        unresolved: [...active.open, ...state.findings.filter((item) => item.blocking ?? item.severity !== "info").map((item) => item.message)],
        failedApproaches: state.control?.execution ? (active.rejectedWarning ? [active.rejectedWarning] : []) : state.control?.failedApproaches.length ? [...state.control.failedApproaches] : [...new Set(state.activities.filter((item) => item.outcome === "fail").map((item) => item.target).filter((x) => Boolean(x)))],
        artifactRefs: state.control.context.artifactRefs.slice(-8),
        recentTurns: state.control.context.recentCompletedTurns.flatMap((index) => { const activity = state.activities[index]; return activity ? [{ ...(activity.target ? { target: activity.target } : {}), ...(activity.outcome ? { outcome: activity.outcome } : {}), ...(activity.artifactRef ? { artifactRef: activity.artifactRef } : {}) }] : []; }),
    };
}
