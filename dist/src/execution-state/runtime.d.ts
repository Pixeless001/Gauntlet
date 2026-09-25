import type { TaskActivity } from "../core/events.js";
import type { TaskState } from "../core/task-state.js";
import { type ProofKind } from "../verify/proof-selector.js";
import { type ProgressStatus } from "./progress.js";
export declare function observeExecution(state: TaskState, activity: TaskActivity): {
    investigate: boolean;
    trigger?: "repeated_failure" | "repeated_rewrite" | "regressed";
    causeValidated: boolean;
    progress?: ProgressStatus;
};
export declare function recordVerification(state: TaskState, passed: boolean, proofRefs: string[], supplied?: ProofKind[]): void;
