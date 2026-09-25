import type { WorkNode } from "./types.js";
export interface Approach {
    mechanism: string;
    target: string;
    assumptions: string[];
}
export interface FailurePrecheck {
    permitted: boolean;
    fingerprint: string;
    constraint?: string;
    evidenceRef?: string;
}
export declare function approachFingerprint(approach: Approach): string;
export declare function precheckFailure(node: WorkNode, approach: Approach): FailurePrecheck;
