import type { DelegatedResult, DelegatedTask } from "../providers/types.js";
import type { TaskState } from "../core/task-state.js";
export declare function createDelegatedTask(state: TaskState): DelegatedTask;
export interface DelegationVerification {
    acceptable: boolean;
    reasons: string[];
}
export declare function verifyDelegatedResult(task: DelegatedTask, result: DelegatedResult): DelegationVerification;
