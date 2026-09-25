import type { TaskState } from "../core/task-state.js";
export interface ActiveExecutionContext {
    task: string;
    acceptanceCriteria: string[];
    constraints: string[];
    validatedState: string[];
    current: string;
    relevantFiles: string[];
    relevantSymbols: string[];
    proofRefs: string[];
    open: string[];
    rejectedWarning?: string;
}
export declare function reconstruct(state: TaskState): ActiveExecutionContext;
