import type { CurrentValidWorld, WorkNode } from "../work/types.js";
export type CandidateDisposition = "validated" | "rejected" | "stale" | "semantic-verification-required";
export interface DeterministicEvaluation {
    commandPassed: boolean;
    artifactsPresent: boolean;
    artifactHashesValid: boolean;
    staticChecksPassed: boolean;
    testsPassed: boolean;
    acceptanceEvidence: boolean;
    preservationEvidence: boolean;
    coldVerificationPassed: boolean;
    ownershipValid: boolean;
    baseCompatible: boolean;
    patchApplicable: boolean;
    scopeValid: boolean;
    rulesValid: boolean;
    semanticAmbiguity?: boolean;
}
export interface CandidateEvaluation {
    disposition: CandidateDisposition;
    reasons: string[];
}
export declare function evaluateCandidate(world: CurrentValidWorld, node: WorkNode, evaluation: DeterministicEvaluation): CandidateEvaluation;
export declare function applyCandidateEvaluation(world: CurrentValidWorld, nodeId: string, evaluation: CandidateEvaluation): CurrentValidWorld;
