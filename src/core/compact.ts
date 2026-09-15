import type { TaskState } from "./task-state.js";

export interface CompactionDecision { compact: boolean; reasons: string[] }
export interface ContinuationRecord { task: string; acceptanceCriteria: string[]; constraints: string[]; repoConstraints: string[]; workingSet: string[]; unresolved: string[]; failedApproaches: string[] }

export function shouldCompact(state: TaskState): CompactionDecision {
  const activities = state.activities.slice(state.session?.lastCompactedActivity ?? 0);
  const output = activities.reduce((sum, item) => sum + item.outputBytes, 0);
  const reads = activities.filter((item) => item.kind === "file_read");
  const repeatedReads = reads.length - new Set(reads.map((item) => item.target)).size;
  const failures = activities.filter((item) => item.outcome === "fail" && item.target).map((item) => item.target!);
  const repeatedFailure = failures.some((target) => failures.filter((item) => item === target).length >= 3);
  const reasons = [output > 500_000 && "large tool output", repeatedReads >= 6 && "repeated file reads", repeatedFailure && "multiple failed attempts"].filter((item): item is string => Boolean(item));
  return { compact: reasons.length > 0 && (state.session?.compactions ?? 0) < (state.session?.budget.compactions ?? 1), reasons };
}

export function compact(state: TaskState): ContinuationRecord {
  return {
    task: state.contract.intent,
    acceptanceCriteria: [...state.contract.acceptanceCriteria],
    constraints: [...state.contract.constraints],
    repoConstraints: (state.conventions ?? []).filter((fact) => fact.strength === "strong").slice(0, 3).map((fact) => `${fact.id}: ${fact.value}`),
    workingSet: [...state.workingSet],
    unresolved: state.findings.filter((item) => item.blocking ?? item.severity !== "info").map((item) => item.message),
    failedApproaches: state.session?.failedApproaches.length ? [...state.session.failedApproaches] : [...new Set(state.activities.filter((item) => item.outcome === "fail").map((item) => item.target).filter((x): x is string => Boolean(x)))],
  };
}
