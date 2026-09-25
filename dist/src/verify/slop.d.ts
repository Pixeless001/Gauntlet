import type { Finding } from "../core/events.js";
import type { FileDelta, TaskState } from "../core/task-state.js";
export interface SlopSignal {
    code: string;
    message: string;
    proof: string[];
}
export declare function analyzeSlopLines(path: string, lines: string[]): SlopSignal[];
export declare function inspectSlop(cwd: string, state: TaskState, changes: FileDelta[]): Promise<Finding[]>;
export declare function inspectSlopForDiff(cwd: string, base: string, changes: FileDelta[]): Promise<Finding[]>;
