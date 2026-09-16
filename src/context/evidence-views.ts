import type { EvidenceAuthority, CostClass } from "../control/selector.js";
import type { UncertaintyKind } from "../control/uncertainty.js";

export type DetailLevel = "reference" | "concise" | "detailed";
export interface EvidenceRef { source: string; locator: string; fingerprint?: string }
export interface EvidenceClaim { id: string; subject: string; statement: string; authority: EvidenceAuthority; refs: EvidenceRef[] }
export interface EvidencePacket {
  id: string;
  claims: EvidenceClaim[];
  refs: EvidenceRef[];
  resolves: UncertaintyKind[];
  detailLevel: DetailLevel;
}
export interface EvidenceRequest { id: string; uncertainty: UncertaintyKind; detailLevel: DetailLevel; target?: string }
export interface EvidenceEstimate { available: boolean; cost: CostClass; likelyNovel: boolean; authority: EvidenceAuthority }
export interface EvidenceSelectionState { suppliedClaims: ReadonlySet<string>; resolved: ReadonlySet<UncertaintyKind> }
export interface EvidenceView {
  id: string;
  resolves: UncertaintyKind[];
  estimate(request: EvidenceRequest, state: EvidenceSelectionState): EvidenceEstimate;
  retrieve(request: EvidenceRequest): Promise<EvidencePacket>;
}

const authorityRank: Record<EvidenceAuthority, number> = { repository: 0, local: 1, runtime: 2, cached: 3, external: 4 };
const detailRank: Record<DetailLevel, number> = { reference: 0, concise: 1, detailed: 2 };

/** Merge conceptually identical claims while retaining the strongest local authority and all provenance. */
export function fuseEvidence(packets: EvidencePacket[], maxDetail: DetailLevel = "concise"): EvidencePacket[] {
  const claims = new Map<string, EvidenceClaim>(), owners = new Map<string, EvidencePacket>();
  for (const packet of packets.filter((item) => detailRank[item.detailLevel] <= detailRank[maxDetail])) {
    for (const claim of packet.claims) {
      const current = claims.get(claim.id);
      if (!current || authorityRank[claim.authority] < authorityRank[current.authority]) {
        claims.set(claim.id, { ...claim, refs: mergeRefs(current?.refs ?? [], claim.refs) }); owners.set(claim.id, packet);
      } else current.refs = mergeRefs(current.refs, claim.refs);
    }
  }
  const grouped = new Map<string, EvidenceClaim[]>();
  for (const [id, claim] of claims) { const packet = owners.get(id)!; grouped.set(packet.id, [...(grouped.get(packet.id) ?? []), claim]); }
  return packets.filter((packet) => grouped.has(packet.id)).map((packet) => ({ ...packet, claims: grouped.get(packet.id)!, refs: mergeRefs(packet.refs, grouped.get(packet.id)!.flatMap((claim) => claim.refs)) }));
}

export function mayExpand(packet: EvidencePacket, uncertainty: UncertaintyKind, state: EvidenceSelectionState): boolean {
  return packet.resolves.includes(uncertainty) && !state.resolved.has(uncertainty) && packet.detailLevel !== "detailed";
}

function mergeRefs(left: EvidenceRef[], right: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return [...left, ...right].filter((ref) => { const key = `${ref.source}:${ref.locator}:${ref.fingerprint ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
