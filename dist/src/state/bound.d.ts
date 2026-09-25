import type { TaskState } from "../core/task-state.js";
/** Per-tool-call history is what grows task state; keep detail for a recent window and shed the rest in tiers, so no run of tool calls can reach the size cap. */
export declare function boundState(state: TaskState): TaskState;
