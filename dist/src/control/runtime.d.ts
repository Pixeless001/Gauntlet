import type { TaskState } from "../core/task-state.js";
import type { RuntimeDirective, BoundaryDecision, ControlDecision } from "./types.js";
import { type ActivationPlan, type InterventionCandidate } from "./selector.js";
export interface ControlInput {
    trigger: "task_start" | "activity" | "file_write" | "failure" | "lifecycle" | "before_stop" | string;
    candidates: InterventionCandidate[];
    supplied?: string[];
    falseActivationCost?: number;
    missedActivationCost?: number;
    stateChange?: string[];
    proofGain?: string[];
}
export interface RuntimeControlResult {
    plan: ActivationPlan;
    boundary: BoundaryDecision;
    decision: ControlDecision;
    directive: RuntimeDirective;
}
export declare function controlRuntime(state: TaskState, input: ControlInput): RuntimeControlResult;
export declare function boundaryDecision(state: TaskState, trigger: string, pressure?: import("./types.js").ContextPressure): BoundaryDecision;
