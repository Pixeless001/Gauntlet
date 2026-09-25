import type { WorkNode } from "./types.js";
export interface SchedulerCapabilities {
    isolatedMutation: boolean;
    maxLocal?: number;
    maxWorkers?: number;
    openUncertainties?: readonly string[];
}
export declare function scheduleReady(nodes: WorkNode[], capabilities: SchedulerCapabilities): WorkNode[];
