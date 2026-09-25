import type { TaskState } from "./task-state.js";
export interface CompactionDecision {
    compact: boolean;
    reasons: string[];
}
export interface ContinuationRecord {
    task: string;
    goal: string;
    acceptanceCriteria: string[];
    preservationRequirements: string[];
    constraints: string[];
    repoConstraints: string[];
    workingSet: string[];
    currentApproach: string;
    unresolved: string[];
    failedApproaches: string[];
    artifactRefs: string[];
    recentTurns: {
        target?: string;
        outcome?: "pass" | "fail" | "unknown";
        artifactRef?: string;
    }[];
    workflow?: string;
    guidance?: string;
}
export declare function shouldCompact(state: TaskState): CompactionDecision;
export declare function compact(state: TaskState): ContinuationRecord;
