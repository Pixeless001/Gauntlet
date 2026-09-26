import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";
export type ProofKind = "contract" | "search" | "graph" | "reproduction" | "repository_rule" | "installed_api" | "test" | "diff" | "browser" | "measurement";
export declare const proofRequirements: Record<UncertaintyKind, ProofKind[][]>;
export declare const proofMap: Record<UncertaintyKind, ProofKind[]>;
export declare function hasSufficientProof(kind: UncertaintyKind, supplied: Iterable<ProofKind>): boolean;
export declare function remainingProof(uncertainty: UncertaintyState, supplied: ProofKind[], obtainable?: ProofKind[]): {
    uncertainty: UncertaintyKind;
    proof: ProofKind;
}[];
/** Proof the stop check can really produce. `graph` is built by the engine itself, so it is never
 *  something the agent can be asked to provide when the engine did not build it. */
export declare function obtainableProof(input: {
    hasIndex: boolean;
    hasStructural: boolean;
    hasTestCheck: boolean;
    extra?: ProofKind[] | undefined;
}): ProofKind[];
