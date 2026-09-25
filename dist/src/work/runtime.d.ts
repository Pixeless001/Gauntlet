import type { TaskActivity } from "../core/events.js";
import type { CandidateResult, CurrentValidWorld, GraphProposal, WorkNode } from "./types.js";
export declare function initializeWork(world: CurrentValidWorld): CurrentValidWorld;
export declare function observeWorldActivity(world: CurrentValidWorld, activity: TaskActivity, observedHash?: string): CurrentValidWorld;
export declare function observeWorldTransition(world: CurrentValidWorld, activity: TaskActivity, observedHash?: string): {
    world: CurrentValidWorld;
    stale: string[];
    cancel: string[];
};
export declare function proposeNodeResult(world: CurrentValidWorld, nodeId: string, result: Omit<CandidateResult, "nodeId" | "attempt" | "inputFingerprint">): CurrentValidWorld;
export declare function refreshFrontier(world: CurrentValidWorld): CurrentValidWorld;
export declare function requiredGraphNodes(world: CurrentValidWorld): WorkNode[];
export declare function admitDiscovery(world: CurrentValidWorld, proposal: GraphProposal, proposer?: "primary" | "worker"): CurrentValidWorld;
