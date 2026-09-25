import type { CandidateResult } from "./types.js";
export interface CandidateReduction {
    claims: string[];
    evidenceRefs: string[];
    artifacts: string[];
    conflicts: string[];
}
export interface SemanticSynthesisRequest {
    conflicts: string[];
    candidates: Pick<CandidateResult, "nodeId" | "attempt" | "claims" | "evidenceRefs" | "affectedPaths">[];
}
export declare function reduceCandidates(candidates: CandidateResult[]): CandidateReduction;
export declare function semanticSynthesisRequest(candidates: CandidateResult[]): SemanticSynthesisRequest | null;
