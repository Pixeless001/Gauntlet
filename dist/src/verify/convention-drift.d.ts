import type { Finding } from "../core/events.js";
import type { FileDelta, TaskState } from "../core/task-state.js";
export declare function inspectConventionDrift(cwd: string, state: TaskState, changes: FileDelta[]): Promise<Finding[]>;
