import { communicationEvidence } from "../work/graph.js";
export function compileWorkerPacket(state, node) {
    const permitted = new Set(state.world.communication.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from));
    return {
        objective: node.title,
        knownFacts: Object.values(state.world.facts).filter((fact) => fact.status === "validated" && (fact.provenance === "contract" || permitted.has(fact.provenance))).map((fact) => fact.statement).slice(0, 16),
        inputs: communicationEvidence(state.world, node.id), preserve: [...state.contract.preservationRequirements], rules: (state.rules ?? []).map((rule) => rule.id).slice(0, 8),
        authority: node.writePaths.length ? "write" : "read-only", ownership: [...node.writePaths], acceptance: [...state.contract.acceptanceCriteria], requiredEvidence: [...node.evidenceRefs], returnSchema: "CandidateResult",
    };
}
export function createVerificationView(state, node) {
    if (!node.candidate)
        throw new Error("Verification view requires a candidate result");
    return {
        goal: state.contract.goal, acceptance: [...state.contract.acceptanceCriteria], preservation: [...state.contract.preservationRequirements],
        impact: [...state.control.impact.callers, ...state.control.impact.tests, ...state.control.impact.publicSurface].slice(0, 32), rules: (state.rules ?? []).map((rule) => rule.id).slice(0, 8),
        candidate: { nodeId: node.candidate.nodeId, artifactRefs: [...node.candidate.artifactRefs], evidenceRefs: [...node.candidate.evidenceRefs], affectedPaths: [...node.candidate.affectedPaths], ...(node.candidate.patchRef ? { patchRef: node.candidate.patchRef } : {}), ...(node.candidate.baseRevision ? { baseRevision: node.candidate.baseRevision } : {}) },
    };
}
export function coldViewHasEvidence(view) {
    return Boolean(view.goal) && view.candidate.artifactRefs.length > 0 && view.candidate.evidenceRefs.every((ref) => view.candidate.artifactRefs.includes(ref));
}
