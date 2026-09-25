import { addCommunicationEdge, addNode, addValidityEdges, claimOwnership, invalidateCone, nodeEarnsStructure, proposeResult, readyFrontier, refreshDecision, retryNode, startNode } from "./graph.js";
import { refreshWorld } from "./world.js";
export function initializeWork(world) {
    if (world.work.nodes.implementation && world.work.nodes.verification)
        return refreshFrontier(world);
    let work = world.work, validity = world.validity, communication = world.communication;
    if (!work.nodes.implementation) {
        work = addNode(work, { id: "implementation", title: "Implement the task contract", kind: "implementation", duration: "meaningful", validityInputs: ["contract", ...Object.keys(world.fingerprint.files).map((path) => `file:${path}`)], writePaths: Object.keys(world.fingerprint.files) });
        validity = addValidityEdges(validity, work.nodes.implementation);
    }
    if (!work.nodes.verification) {
        work = addNode(work, { id: "verification", title: "Verify acceptance and preservation", kind: "verification", executor: "verifier", dependencies: ["implementation"], duration: "short", validityInputs: ["implementation", "contract"] });
        validity = addValidityEdges(validity, work.nodes.verification);
    }
    communication = addCommunicationEdge(communication, "implementation", "verification");
    return refreshFrontier({ ...world, revision: world.revision + 1, work, validity, communication });
}
export function observeWorldActivity(world, activity, observedHash) {
    return observeWorldTransition(world, activity, observedHash).world;
}
export function observeWorldTransition(world, activity, observedHash) {
    if (!activity.target || !["file_write", "command", "test_result", "diff_change"].includes(activity.kind))
        return { world, stale: [], cancel: [] };
    const source = activity.kind === "file_write" ? `file:${activity.target}` : `activity:${activity.kind}:${activity.target}`;
    const invalidated = invalidateCone(world, source);
    const files = activity.kind === "file_write" && Object.hasOwn(invalidated.world.fingerprint.files, activity.target)
        ? { ...invalidated.world.fingerprint.files, [activity.target]: observedHash ?? `${invalidated.world.fingerprint.files[activity.target]}:${activity.outcome ?? "unknown"}` }
        : invalidated.world.fingerprint.files;
    const refreshed = refreshWorld(invalidated.world, { contract: invalidated.world.fingerprint.contract, files, packages: invalidated.world.fingerprint.packages, config: invalidated.world.fingerprint.config, upstream: invalidated.world.fingerprint.upstream, rules: invalidated.world.fingerprint.rules, runtime: invalidated.world.fingerprint.runtime }, invalidated.world.canonicalRevision);
    const facts = {
        ...refreshed.facts,
        [source]: { id: source, provenance: source, statement: `${activity.kind} observed for ${activity.target}`, evidenceRefs: [activity.artifactRef, activity.proofRef].filter((item) => Boolean(item)), fingerprint: `${refreshed.fingerprint.value}:${activity.outcome ?? "unknown"}`, version: (refreshed.facts[source]?.version ?? 0) + 1, status: "validated" },
    };
    return { world: refreshFrontier({ ...refreshed, facts, revision: refreshed.revision + 1 }), stale: invalidated.stale, cancel: invalidated.cancel };
}
export function proposeNodeResult(world, nodeId, result) {
    let work = world.work, node = work.nodes[nodeId];
    if (!node)
        throw new Error(`Unknown work node: ${nodeId}`);
    if (node.rejection?.approachFingerprint && node.rejection.approachFingerprint === result.approachFingerprint)
        throw new Error(`Rejected approach requires a new mechanism, target, or assumption: ${nodeId}`);
    if (node.state === "REJECTED" || node.state === "STALE") {
        work = retryNode(work, nodeId);
        node = work.nodes[nodeId];
    }
    let next = { ...world, work };
    if (node.writePaths.length)
        next = claimOwnership(next, node);
    if (node.state === "READY") {
        work = startNode(work, nodeId);
        node = work.nodes[nodeId];
    }
    if (node.state !== "RUNNING")
        throw new Error(`Work node cannot propose a result: ${nodeId}`);
    work = proposeResult(work, { ...result, nodeId, attempt: node.attempt, inputFingerprint: world.fingerprint.value });
    return refreshFrontier({ ...next, revision: next.revision + 1, work });
}
export function refreshFrontier(world) {
    return refreshDecision(world, readyFrontier(world).map((node) => node.id));
}
export function requiredGraphNodes(world) { return Object.values(world.work.nodes).filter((node) => node.required); }
export function admitDiscovery(world, proposal, proposer = "primary") {
    if (proposer === "worker")
        throw new Error("Workers cannot create work nodes");
    if (!nodeEarnsStructure(proposal))
        return world;
    const work = addNode(world.work, proposal), validity = addValidityEdges(world.validity, work.nodes[proposal.id]);
    return refreshFrontier({ ...world, revision: world.revision + 1, work, validity });
}
