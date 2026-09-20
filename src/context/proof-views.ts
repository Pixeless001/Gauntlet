import type { ProofAuthority, CostClass } from "../control/selector.js";
import type { UncertaintyKind } from "../control/uncertainty.js";

export type DetailLevel = "reference" | "concise" | "detailed" | "raw";
export interface SourceRef { source: string; locator: string; fingerprint?: string }
export interface ProofClaim { id: string; subject: string; statement: string; authority: ProofAuthority; sourceRefs: SourceRef[] }
export interface ProofPacket {
  id: string;
  claims: ProofClaim[];
  sourceRefs: SourceRef[];
  resolves: UncertaintyKind[];
  detailLevel: DetailLevel;
}
export interface ProofRequest { id: string; uncertainty: UncertaintyKind; detailLevel: DetailLevel; target?: string }
export interface ProofEstimate { available: boolean; cost: CostClass; likelyNovel: boolean; authority: ProofAuthority }
export interface ProofSelectionState { suppliedClaims: ReadonlySet<string>; resolved: ReadonlySet<UncertaintyKind> }
export interface ProofView {
  id: string;
  resolves: UncertaintyKind[];
  estimate(request: ProofRequest, state: ProofSelectionState): ProofEstimate;
  retrieve(request: ProofRequest): Promise<ProofPacket>;
}

const authorityRank: Record<ProofAuthority, number> = { repository: 0, local: 1, runtime: 2, cached: 3, external: 4 };
const detailRank: Record<DetailLevel, number> = { reference: 0, concise: 1, detailed: 2, raw: 3 };

/** Merge identical claims while retaining the strongest authority and every source. */
export function fuseProof(packets: ProofPacket[], maxDetail: DetailLevel = "concise"): ProofPacket[] {
  const claims = new Map<string, ProofClaim>(), owners = new Map<string, ProofPacket>();
  for (const packet of packets.filter((item) => detailRank[item.detailLevel] <= detailRank[maxDetail])) {
    for (const claim of packet.claims) {
      const current = claims.get(claim.id);
      if (!current || authorityRank[claim.authority] < authorityRank[current.authority]) {
        claims.set(claim.id, { ...claim, sourceRefs: mergeRefs(current?.sourceRefs ?? [], claim.sourceRefs) }); owners.set(claim.id, packet);
      } else current.sourceRefs = mergeRefs(current.sourceRefs, claim.sourceRefs);
    }
  }
  const grouped = new Map<string, ProofClaim[]>();
  for (const [id, claim] of claims) { const packet = owners.get(id)!; grouped.set(packet.id, [...(grouped.get(packet.id) ?? []), claim]); }
  return packets.filter((packet) => grouped.has(packet.id)).map((packet) => ({ ...packet, claims: grouped.get(packet.id)!, sourceRefs: mergeRefs(packet.sourceRefs, grouped.get(packet.id)!.flatMap((claim) => claim.sourceRefs)) }));
}

export function mayExpand(packet: ProofPacket, uncertainty: UncertaintyKind, state: ProofSelectionState): boolean {
  return packet.resolves.includes(uncertainty) && !state.resolved.has(uncertainty) && packet.detailLevel !== "detailed" && packet.detailLevel !== "raw";
}

function mergeRefs(left: SourceRef[], right: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return [...left, ...right].filter((ref) => { const key = `${ref.source}:${ref.locator}:${ref.fingerprint ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
