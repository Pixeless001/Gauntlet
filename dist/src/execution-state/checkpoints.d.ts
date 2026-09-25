import type { UncertaintyKind } from "../control/uncertainty.js";
export type CheckpointKind = "task" | "understanding" | "investigation" | "decision" | "implementation" | "verification";
export type CheckpointStatus = "active" | "validated" | "rejected";
export interface ExecutionCheckpoint {
    id: string;
    parentId?: string;
    kind: CheckpointKind;
    status: CheckpointStatus;
    summary: string;
    constraints: string[];
    decisions: string[];
    relevantFiles: string[];
    relevantSymbols: string[];
    proofRefs: string[];
    rejectionReason?: string;
    createdFromEvent: number;
    resolves: UncertaintyKind[];
}
export declare function activePath(checkpoints: ExecutionCheckpoint[], activeId: string): ExecutionCheckpoint[];
export declare function rejectBranch(checkpoints: ExecutionCheckpoint[], activeId: string, replacement: ExecutionCheckpoint, reason: string): ExecutionCheckpoint[];
export declare function rejectedOverlap(checkpoints: ExecutionCheckpoint[], target: string): ExecutionCheckpoint | null;
