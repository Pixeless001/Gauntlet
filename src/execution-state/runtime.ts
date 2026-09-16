import { randomUUID } from "node:crypto";
import type { TaskActivity } from "../core/events.js";
import type { TaskState } from "../core/task-state.js";
import { activePath, rejectBranch } from "./checkpoints.js";
import type { ExecutionCheckpoint } from "./checkpoints.js";
import type { ExecutionEvent, ExecutionEventType } from "./events.js";
import { hasSufficientEvidence, type EvidenceKind } from "../verify/evidence-selector.js";
import { assessProgress, type ProgressStatus } from "./progress.js";

export function observeExecution(state: TaskState, activity: TaskActivity): { investigate: boolean; trigger?: "repeated_failure" | "repeated_rewrite" | "regressed"; causeValidated: boolean; progress?: ProgressStatus } {
  const execution = state.session?.execution;
  if (!execution) return { investigate: false, causeValidated: false };
  if (activity.kind === "message") return { investigate: false, causeValidated: false };
  const type: ExecutionEventType = activity.kind === "command" && activity.outcome === "fail" ? "failure" : activity.kind;
  execution.events.push({ index: execution.nextEvent++, type, ...(activity.target ? { target: activity.target } : {}), ...(activity.outcome ? { outcome: activity.outcome } : {}), ...(activity.evidenceRef ? { evidenceRef: activity.evidenceRef } : {}) });
  if (execution.events.length > 512) execution.events.splice(0, execution.events.length - 512);
  const failures = execution.events.filter((item) => item.type === "failure" && item.target).map((item) => item.target!);
  const repeatedFailure = Boolean(activity.target && activity.outcome === "fail" && failures.filter((target) => target === activity.target).length >= 2);
  const repeatedRewrite = Boolean(activity.kind === "file_write" && activity.target && execution.events.filter((item) => item.type === "file_write" && item.target === activity.target).length >= 3);
  const causeValidated = activity.report?.kind === "cause_validated" || activity.kind === "decision_signal" && activity.outcome === "pass" && Boolean(activity.target?.startsWith("cause:"));
  const approachRejected = activity.report?.kind === "approach_rejected" || activity.kind === "decision_signal" && activity.outcome === "fail" && Boolean(activity.target?.startsWith("reject:"));
  updateUncertainty(state, activity);
  const progress = assessProgress({ events: execution.events, checkpoints: execution.checkpoints, activeCheckpointId: execution.activeCheckpointId, uncertainty: state.session!.uncertainty! });
  const investigate = progress.status !== "PROGRESS";
  const trigger = progress.status === "REGRESSED" ? "regressed" as const : repeatedFailure ? "repeated_failure" as const : repeatedRewrite ? "repeated_rewrite" as const : undefined;
  if (investigate && active(execution.checkpoints, execution.activeCheckpointId)?.kind !== "investigation") {
    activate(execution, checkpoint("investigation", `${repeatedFailure ? "Investigate repeated failure" : "Reassess repeated rewrite"}: ${activity.target}`, execution.activeCheckpointId, execution.nextEvent - 1));
  }
  if (causeValidated) {
    const current = active(execution.checkpoints, execution.activeCheckpointId); if (current) { current.status = "validated"; current.resolves = ["cause"]; current.evidenceRefs = [...new Set([...current.evidenceRefs, ...(activity.report?.evidenceRefs ?? []), ...(activity.evidenceRef ? [activity.evidenceRef] : [])])]; applyReport(current, activity); }
    const summary = activity.report?.summary ?? activity.target!.slice("cause:".length).trim();
    const next = checkpoint("implementation", summary, execution.activeCheckpointId, execution.nextEvent - 1); applyReport(next, activity); activate(execution, next);
  }
  if (approachRejected) {
    const current = active(execution.checkpoints, execution.activeCheckpointId);
    if (current) {
      const reason = activity.report?.summary ?? activity.target!.slice("reject:".length).trim();
      const replacement = checkpoint(current.kind === "investigation" ? "investigation" : "implementation", "Choose a replacement approach", current.parentId ?? execution.checkpoints[0]!.id, execution.nextEvent - 1);
      execution.checkpoints = rejectBranch(execution.checkpoints, current.id, replacement, reason);
      execution.activeCheckpointId = replacement.id;
    }
  }
  if (activity.report && !causeValidated && !approachRejected) {
    const current = active(execution.checkpoints, execution.activeCheckpointId);
    if (current) applyReport(current, activity);
  }
  return { investigate, ...(trigger ? { trigger } : {}), causeValidated, progress: progress.status };
}

function updateUncertainty(state: TaskState, activity: TaskActivity): void {
  const uncertainty = state.session?.uncertainty, target = activity.target?.toLowerCase() ?? ""; if (!uncertainty) return;
  if (activity.kind === "file_write") {
    if (uncertainty.visual !== "irrelevant" && /\.(?:css|scss|sass|less|tsx|jsx|html)$/.test(target)) uncertainty.visual = "open";
    if (/(?:^|\/)(?:migrations?|schema|auth|security|permissions?)(?:\/|\.|$)/.test(target)) { uncertainty.repoFit = "open"; uncertainty.regression = "open"; }
    if (/(?:^|\/)(?:index\.[cm]?[jt]s|package\.json)$/.test(target)) uncertainty.regression = "open";
    uncertainty.scope = "open";
  }
  if (activity.kind === "test_result" && activity.outcome === "pass") uncertainty.behavior = uncertainty.behavior === "irrelevant" ? "irrelevant" : "resolved";
  if ((activity.kind === "test_result" || activity.kind === "decision_signal") && activity.outcome === "pass" && /(?:profile|benchmark|performance|latency|throughput)/.test(target)) uncertainty.performance = uncertainty.performance === "irrelevant" ? "irrelevant" : "resolved";
}

export function recordVerification(state: TaskState, passed: boolean, evidenceRefs: string[], supplied: EvidenceKind[] = []): void {
  const session = state.session, execution = session?.execution; if (!session || !execution) return;
  const status = passed ? "validated" : "rejected", summary = passed ? "Required machine evidence passed" : "Required machine evidence failed";
  const current = active(execution.checkpoints, execution.activeCheckpointId), parentId = current?.kind === "verification" ? current.parentId : execution.activeCheckpointId;
  const existing = current?.kind === "verification" ? current : execution.checkpoints.find((item) => item.kind === "verification" && item.parentId === parentId && item.status === status);
  if (existing) { existing.status = status; existing.summary = summary; existing.evidenceRefs = [...new Set(evidenceRefs)]; if (passed) execution.activeCheckpointId = existing.id; else if (existing.parentId) execution.activeCheckpointId = existing.parentId; }
  else { const next = checkpoint("verification", summary, parentId ?? execution.activeCheckpointId, execution.nextEvent); next.status = status; next.evidenceRefs = [...new Set(evidenceRefs)]; execution.checkpoints.push(next); if (passed) execution.activeCheckpointId = next.id; }
  if (passed && session.uncertainty) {
    const available = new Set(supplied);
    for (const kind of Object.keys(session.uncertainty) as (keyof typeof session.uncertainty)[]) {
      if (session.uncertainty[kind] !== "irrelevant" && hasSufficientEvidence(kind, available)) session.uncertainty[kind] = "resolved";
    }
  }
}

function checkpoint(kind: ExecutionCheckpoint["kind"], summary: string, parentId: string, event: number): ExecutionCheckpoint { return { id: randomUUID(), parentId, kind, status: "active", summary, constraints: [], decisions: [], relevantFiles: [], relevantSymbols: [], evidenceRefs: [], createdFromEvent: event, resolves: [] }; }
function applyReport(target: ExecutionCheckpoint, activity: TaskActivity): void {
  const report = activity.report; if (!report) return;
  target.constraints = [...new Set([...target.constraints, ...report.constraints])];
  target.relevantFiles = [...new Set([...target.relevantFiles, ...report.relevantFiles])];
  target.relevantSymbols = [...new Set([...target.relevantSymbols, ...report.relevantSymbols])];
  target.evidenceRefs = [...new Set([...target.evidenceRefs, ...report.evidenceRefs])];
  if (report.kind === "hypothesis" || report.kind === "implementation_selected") target.decisions = [...new Set([...target.decisions, report.summary])];
}
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
