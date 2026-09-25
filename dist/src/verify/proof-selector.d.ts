import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";
export type ProofKind = "contract" | "search" | "graph" | "reproduction" | "repository_rule" | "installed_api" | "test" | "diff" | "browser" | "measurement";
export declare const proofRequirements: Record<UncertaintyKind, ProofKind[][]>;
export declare const proofMap: Record<UncertaintyKind, ProofKind[]>;
export declare function hasSufficientProof(kind: UncertaintyKind, supplied: Iterable<ProofKind>): boolean;
export declare function remainingProof(uncertainty: UncertaintyState, supplied: ProofKind[], obtainable?: ProofKind[]): {
    uncertainty: UncertaintyKind;
    proof: ProofKind;
}[];
