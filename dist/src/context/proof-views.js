const authorityRank = { repository: 0, local: 1, runtime: 2, cached: 3, external: 4 };
const detailRank = { reference: 0, concise: 1, detailed: 2, raw: 3 };
/** Merge identical claims while retaining the strongest authority and every source. */
export function fuseProof(packets, maxDetail = "concise") {
    const claims = new Map(), owners = new Map();
    for (const packet of packets.filter((item) => detailRank[item.detailLevel] <= detailRank[maxDetail])) {
        for (const claim of packet.claims) {
            const current = claims.get(claim.id);
            if (!current || authorityRank[claim.authority] < authorityRank[current.authority]) {
                claims.set(claim.id, { ...claim, sourceRefs: mergeRefs(current?.sourceRefs ?? [], claim.sourceRefs) });
                owners.set(claim.id, packet);
            }
            else
                current.sourceRefs = mergeRefs(current.sourceRefs, claim.sourceRefs);
        }
    }
    const grouped = new Map();
    for (const [id, claim] of claims) {
        const packet = owners.get(id);
        grouped.set(packet.id, [...(grouped.get(packet.id) ?? []), claim]);
    }
    return packets.filter((packet) => grouped.has(packet.id)).map((packet) => ({ ...packet, claims: grouped.get(packet.id), sourceRefs: mergeRefs(packet.sourceRefs, grouped.get(packet.id).flatMap((claim) => claim.sourceRefs)) }));
}
export function mayExpand(packet, uncertainty, state) {
    return packet.resolves.includes(uncertainty) && !state.resolved.has(uncertainty) && packet.detailLevel !== "detailed" && packet.detailLevel !== "raw";
}
function mergeRefs(left, right) {
    const seen = new Set();
    return [...left, ...right].filter((ref) => { const key = `${ref.source}:${ref.locator}:${ref.fingerprint ?? ""}`; if (seen.has(key))
        return false; seen.add(key); return true; });
}
