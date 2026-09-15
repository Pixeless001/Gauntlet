import { randomUUID } from "node:crypto";
import type { TaskActivity } from "../core/events.js";
import type { TaskState } from "../core/task-state.js";
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
  if (repeatedFailure && active(execution.checkpoints, execution.activeCheckpointId)?.kind !== "investigation") {
    activate(execution, checkpoint("investigation", `Investigate repeated failure: ${activity.target}`, execution.activeCheckpointId, execution.nextEvent - 1));
  }
  if (causeValidated) {
    const current = active(execution.checkpoints, execution.activeCheckpointId); if (current) { current.status = "validated"; current.resolves = ["cause"]; if (activity.evidenceRef) current.evidenceRefs.push(activity.evidenceRef); }
    activate(execution, checkpoint("implementation", activity.target!.slice("cause:".length).trim(), execution.activeCheckpointId, execution.nextEvent - 1));
  }
  return { repeatedFailure, causeValidated };
}

function checkpoint(kind: ExecutionCheckpoint["kind"], summary: string, parentId: string, event: number): ExecutionCheckpoint { return { id: randomUUID(), parentId, kind, status: "active", summary, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], evidenceRefs: [], createdFromEvent: event, resolves: [] }; }
function active(checkpoints: ExecutionCheckpoint[], id: string): ExecutionCheckpoint | undefined { return checkpoints.find((item) => item.id === id); }
function activate(execution: NonNullable<NonNullable<TaskState["session"]>["execution"]>, next: ExecutionCheckpoint): void { const current = active(execution.checkpoints, execution.activeCheckpointId); if (current?.status === "active") current.status = "validated"; execution.checkpoints.push(next); execution.activeCheckpointId = next.id; if (execution.checkpoints.length > 128) execution.checkpoints.splice(1, execution.checkpoints.length - 128); }
