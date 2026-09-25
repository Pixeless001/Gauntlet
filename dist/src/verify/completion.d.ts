import type { TaskContract } from "../core/events.js";
import type { Finding } from "../core/events.js";
import type { UncertaintyState } from "../control/uncertainty.js";
import type { ProofKind } from "./proof-selector.js";
import type { CurrentValidWorld } from "../work/types.js";
export interface CompletionDecision {
    status: "complete" | "incomplete" | "semantic-verification-required";
    reasons: string[];
    missingInvariants?: string[];
    missingProof: ProofKind[];
    proofRefs?: string[];
}
export interface CompletionContext {
    repositoryRevision?: string | null;
    evidenceValid?: boolean;
}
export declare function decideCompletion(contract: TaskContract, findings: Finding[], uncertainty: UncertaintyState, supplied: ProofKind[], world?: CurrentValidWorld, context?: CompletionContext): CompletionDecision;
export declare function requiredPreservationProof(contract: TaskContract): ProofKind[];
