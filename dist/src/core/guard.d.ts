import type { Finding } from "./events.js";
import type { Baseline, FileDelta, TaskState } from "./task-state.js";
export declare function evaluateGuards(cwd: string, state: TaskState, changes: FileDelta[]): Promise<Finding[]>;
export declare function loopFinding(state: TaskState): Finding | null;
export declare function dependencyDelta(before: Baseline, after: string[]): string[];
