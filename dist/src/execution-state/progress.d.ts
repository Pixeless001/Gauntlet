import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";
import { type ExecutionCheckpoint } from "./checkpoints.js";
import type { ExecutionEvent } from "./events.js";
export type ProgressStatus = "PROGRESS" | "STALLED" | "REGRESSED";
export interface ProgressDelta {
    status: ProgressStatus;
    reason: string;
    unresolved: UncertaintyKind[];
    proofGained: boolean;
    uncertaintyDelta: number;
    proofDelta: number;
    failureSignature?: string;
    changedFailure: boolean;
    repeatedTargets: string[];
    diffGrowth: number;
    rejectedOverlap: boolean;
}
export interface ProgressInput {
    events: ExecutionEvent[];
    checkpoints: ExecutionCheckpoint[];
    activeCheckpointId: string;
    uncertainty: UncertaintyState;
    previousUnresolved?: UncertaintyKind[];
    diffGrowth?: number;
}
/** Classify observable task movement without treating code volume or tool count as progress. */
export declare function assessProgress(input: ProgressInput): ProgressDelta;
