import type { DelegatedResult, DelegatedTask } from "../providers/types.js";
import type { TaskState } from "../core/task-state.js";
import { reconstruct } from "./reconstruct.js";

export function delegationHandoff(state: TaskState): DelegatedTask {
  const active = reconstruct(state);
  return { goal: active.task, acceptanceCriteria: active.acceptanceCriteria, constraints: active.constraints, scope: active.relevantFiles.slice(0, 16), relevantFiles: active.relevantFiles.slice(0, 16), activeRules: (state.conventions ?? []).filter((item) => item.strength === "strong").slice(0, 3).map((item) => item.value), validatedState: active.validatedState.slice(-8), currentApproach: active.current, evidenceRefs: active.evidenceRefs.slice(-8) };
}

export interface DelegationVerification { acceptable: boolean; reasons: string[] }
export function verifyDelegatedResult(task: DelegatedTask, result: DelegatedResult): DelegationVerification {
  const allowed = new Set(task.scope), outsideScope = result.changedFiles.filter((path) => !allowed.has(path));
  const reasons = [result.status !== "complete" ? result.blocker ?? "Delegated work did not complete" : "", result.status === "complete" && !result.evidence.length ? "Delegated completion has no evidence" : "", outsideScope.length ? `Delegated changes exceeded scope: ${outsideScope.join(", ")}` : ""].filter(Boolean);
  return { acceptable: reasons.length === 0, reasons };
}
