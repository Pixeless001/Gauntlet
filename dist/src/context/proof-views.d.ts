import type { ProofAuthority, CostClass } from "../control/selector.js";
import type { UncertaintyKind } from "../control/uncertainty.js";
export type DetailLevel = "reference" | "concise" | "detailed" | "raw";
export interface SourceRef {
    source: string;
    locator: string;
    fingerprint?: string;
}
export interface ProofClaim {
    id: string;
    subject: string;
    statement: string;
    authority: ProofAuthority;
    sourceRefs: SourceRef[];
}
export interface ProofPacket {
    id: string;
    claims: ProofClaim[];
    sourceRefs: SourceRef[];
    resolves: UncertaintyKind[];
    detailLevel: DetailLevel;
}
export interface ProofRequest {
    id: string;
    uncertainty: UncertaintyKind;
    detailLevel: DetailLevel;
    target?: string;
}
export interface ProofEstimate {
    available: boolean;
    cost: CostClass;
    likelyNovel: boolean;
    authority: ProofAuthority;
}
export interface ProofSelectionState {
    suppliedClaims: ReadonlySet<string>;
    resolved: ReadonlySet<UncertaintyKind>;
}
export interface ProofView {
    id: string;
    resolves: UncertaintyKind[];
    estimate(request: ProofRequest, state: ProofSelectionState): ProofEstimate;
    retrieve(request: ProofRequest): Promise<ProofPacket>;
}
/** Merge identical claims while retaining the strongest authority and every source. */
export declare function fuseProof(packets: ProofPacket[], maxDetail?: DetailLevel): ProofPacket[];
export declare function mayExpand(packet: ProofPacket, uncertainty: UncertaintyKind, state: ProofSelectionState): boolean;
