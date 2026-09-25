import type { TaskContract } from "../core/events.js";
import type { FileDelta } from "../core/task-state.js";
import type { StructuralIndex } from "./index.js";
export interface ScopeAssessment {
    expected: string[];
    actual: string[];
    unexpected: string[];
    hardSignals: string[];
    softSignals: string[];
}
export declare function expectedScope(contract: TaskContract, index?: StructuralIndex): string[];
export declare function assessScope(contract: TaskContract, changes: FileDelta[], beforeDependencies: string[], afterDependencies: string[], index?: StructuralIndex, publicExports?: Record<string, string[]>): ScopeAssessment;
