import type { TaskState } from "../core/task-state.js";
/** Per-tool-call history is what grows task state; keep full detail for a recent window (and failures, which loop detection needs) so long tasks stay under the size cap. */
export declare function boundState(state: TaskState): TaskState;
