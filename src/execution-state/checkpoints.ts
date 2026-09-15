import type { UncertaintyKind } from "../control/uncertainty.js";

export type CheckpointKind = "task" | "understanding" | "investigation" | "decision" | "implementation" | "verification";
export type CheckpointStatus = "active" | "validated" | "rejected";
export interface ExecutionCheckpoint {
  id: string; parentId?: string; kind: CheckpointKind; status: CheckpointStatus; summary: string;
  constraints: string[]; decisions: string[]; relevantFiles: string[]; relevantSymbols: string[];
  evidenceRefs: string[]; rejectionReason?: string; createdFromEvent: number; resolves: UncertaintyKind[];
}

export function activePath(checkpoints: ExecutionCheckpoint[], activeId: string): ExecutionCheckpoint[] {
  const byId = new Map(checkpoints.map((item) => [item.id, item])), path: ExecutionCheckpoint[] = [];
  let current = byId.get(activeId), seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) throw new Error("Execution checkpoint cycle");
    seen.add(current.id); path.push(current); current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path.reverse();
}

export function rejectBranch(checkpoints: ExecutionCheckpoint[], activeId: string, replacement: ExecutionCheckpoint, reason: string): ExecutionCheckpoint[] {
  const current = checkpoints.find((item) => item.id === activeId);
  if (!current) throw new Error("Active execution checkpoint is missing");
  current.status = "rejected"; current.rejectionReason = reason;
  if (current.parentId) replacement.parentId = current.parentId; else delete replacement.parentId;
  replacement.status = "active";
  return [...checkpoints, replacement];
}
