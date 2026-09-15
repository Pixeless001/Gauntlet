import { randomUUID } from "node:crypto";
import type { TaskActivity } from "../core/events.js";
import type { TaskState } from "../core/task-state.js";
import { activePath, rejectBranch } from "./checkpoints.js";
import type { ExecutionCheckpoint } from "./checkpoints.js";
import type { ExecutionEvent, ExecutionEventType } from "./events.js";

export function observeExecution(state: TaskState, activity: TaskActivity): { repeatedFailure: boolean; causeValidated: boolean } {
  const execution = state.session?.execution;
  if (!execution) return { repeatedFailure: false, causeValidated: false };
  if (activity.kind === "message") return { repeatedFailure: false, causeValidated: false };
  const type: ExecutionEventType = activity.kind === "command" && activity.outcome === "fail" ? "failure" : activity.kind;
  execution.events.push({ index: execution.nextEvent++, type, ...(activity.target ? { target: activity.target } : {}), ...(activity.outcome ? { outcome: activity.outcome } : {}), ...(activity.evidenceRef ? { evidenceRef: activity.evidenceRef } : {}) });
  if (execution.events.length > 512) execution.events.splice(0, execution.events.length - 512);
  const failures = execution.events.filter((item) => item.type === "failure" && item.target).map((item) => item.target!);
  const repeatedFailure = Boolean(activity.target && activity.outcome === "fail" && failures.filter((target) => target === activity.target).length >= 2);
  const causeValidated = activity.kind === "decision_signal" && activity.outcome === "pass" && Boolean(activity.target?.startsWith("cause:"));
  const approachRejected = activity.kind === "decision_signal" && activity.outcome === "fail" && Boolean(activity.target?.startsWith("reject:"));
  if (repeatedFailure && active(execution.checkpoints, execution.activeCheckpointId)?.kind !== "investigation") {
    activate(execution, checkpoint("investigation", `Investigate repeated failure: ${activity.target}`, execution.activeCheckpointId, execution.nextEvent - 1));
  }
  if (causeValidated) {
    const current = active(execution.checkpoints, execution.activeCheckpointId); if (current) { current.status = "validated"; current.resolves = ["cause"]; if (activity.evidenceRef) current.evidenceRefs.push(activity.evidenceRef); }
    activate(execution, checkpoint("implementation", activity.target!.slice("cause:".length).trim(), execution.activeCheckpointId, execution.nextEvent - 1));
  }
  if (approachRejected) {
    const current = active(execution.checkpoints, execution.activeCheckpointId);
    if (current) {
      const reason = activity.target!.slice("reject:".length).trim();
      const replacement = checkpoint(current.kind === "investigation" ? "investigation" : "implementation", "Choose a replacement approach", current.parentId ?? execution.checkpoints[0]!.id, execution.nextEvent - 1);
      execution.checkpoints = rejectBranch(execution.checkpoints, current.id, replacement, reason);
      execution.activeCheckpointId = replacement.id;
    }
  }
  return { repeatedFailure, causeValidated };
}

export function recordVerification(state: TaskState, passed: boolean, evidenceRefs: string[]): void {
  const session = state.session, execution = session?.execution; if (!session || !execution) return;
  const status = passed ? "validated" : "rejected", summary = passed ? "Required machine evidence passed" : "Required machine evidence failed";
  const current = active(execution.checkpoints, execution.activeCheckpointId), parentId = current?.kind === "verification" ? current.parentId : execution.activeCheckpointId;
  const existing = current?.kind === "verification" ? current : execution.checkpoints.find((item) => item.kind === "verification" && item.parentId === parentId && item.status === status);
  if (existing) { existing.status = status; existing.summary = summary; existing.evidenceRefs = [...new Set(evidenceRefs)]; if (passed) execution.activeCheckpointId = existing.id; else if (existing.parentId) execution.activeCheckpointId = existing.parentId; }
  else { const next = checkpoint("verification", summary, parentId ?? execution.activeCheckpointId, execution.nextEvent); next.status = status; next.evidenceRefs = [...new Set(evidenceRefs)]; execution.checkpoints.push(next); if (passed) execution.activeCheckpointId = next.id; }
  if (passed && session.uncertainty) { session.uncertainty.behavior = session.uncertainty.behavior === "irrelevant" ? "irrelevant" : "resolved"; session.uncertainty.regression = session.uncertainty.regression === "irrelevant" ? "irrelevant" : "resolved"; session.uncertainty.scope = "resolved"; }
}

function checkpoint(kind: ExecutionCheckpoint["kind"], summary: string, parentId: string, event: number): ExecutionCheckpoint { return { id: randomUUID(), parentId, kind, status: "active", summary, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], evidenceRefs: [], createdFromEvent: event, resolves: [] }; }
function active(checkpoints: ExecutionCheckpoint[], id: string): ExecutionCheckpoint | undefined { return checkpoints.find((item) => item.id === id); }
function activate(execution: NonNullable<NonNullable<TaskState["session"]>["execution"]>, next: ExecutionCheckpoint): void {
  const current = active(execution.checkpoints, execution.activeCheckpointId);
  if (current?.status === "active") current.status = "validated";
  execution.checkpoints.push(next); execution.activeCheckpointId = next.id;
  if (execution.checkpoints.length <= 128) return;
  const required = new Set(activePath(execution.checkpoints, execution.activeCheckpointId).map((item) => item.id));
  const rejected = execution.checkpoints.filter((item) => item.status === "rejected").slice(-16);
  for (const item of rejected) required.add(item.id);
  const optional = execution.checkpoints.filter((item) => !required.has(item.id)).slice(-(128 - required.size));
  execution.checkpoints = execution.checkpoints.filter((item) => required.has(item.id) || optional.includes(item));
}
