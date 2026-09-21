import { rejectNode, releaseOwnership, validateNode, writeOwnershipConflicts } from "../work/graph.js";
import type { CurrentValidWorld, WorkNode } from "../work/types.js";

export type CandidateDisposition = "validated" | "rejected" | "stale" | "semantic-verification-required";
export interface DeterministicEvaluation {
  commandPassed: boolean;
  artifactsPresent: boolean;
  artifactHashesValid: boolean;
  staticChecksPassed: boolean;
  testsPassed: boolean;
  acceptanceEvidence: boolean;
  preservationEvidence: boolean;
  coldVerificationPassed: boolean;
  ownershipValid: boolean;
  baseCompatible: boolean;
  patchApplicable: boolean;
  scopeValid: boolean;
  rulesValid: boolean;
  semanticAmbiguity?: boolean;
}
export interface CandidateEvaluation { disposition: CandidateDisposition; reasons: string[]; }

export function evaluateCandidate(world: CurrentValidWorld, node: WorkNode, evaluation: DeterministicEvaluation): CandidateEvaluation {
  const candidate = node.candidate;
  if (!candidate) return { disposition: "rejected", reasons: ["missing candidate result"] };
  const checks: [boolean, string][] = [
    [evaluation.commandPassed, "command failed"], [evaluation.artifactsPresent, "expected artifact missing"], [evaluation.artifactHashesValid, "artifact hash mismatch"], [evaluation.staticChecksPassed, "static check failed"], [evaluation.testsPassed, "test failed"],
    [node.dependencies.every((id) => ["VALIDATED", "COLLAPSED"].includes(world.work.nodes[id]?.state ?? "")), "work dependency is not validated"],
    [evaluation.acceptanceEvidence, "acceptance evidence missing"], [evaluation.preservationEvidence, "preservation evidence missing"], [evaluation.coldVerificationPassed, "cold verification failed"],
    [candidate.inputFingerprint === world.fingerprint.value, "candidate input world is stale"],
    [evaluation.ownershipValid && writeOwnershipConflicts(world, node).length === 0, "write ownership invalid"], [evaluation.baseCompatible && (!candidate.baseRevision || candidate.baseRevision === world.canonicalRevision), "base revision changed"], [evaluation.patchApplicable, "candidate patch is not applicable"], [evaluation.scopeValid, "scope violation"], [evaluation.rulesValid, "repository rule violation"],
  ];
  const reasons = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
  if (reasons.includes("candidate input world is stale")) return { disposition: "stale", reasons };
  if (reasons.length) return { disposition: "rejected", reasons };
  if (candidate.unresolved.length || evaluation.semanticAmbiguity) return { disposition: "semantic-verification-required", reasons: candidate.unresolved.map((item) => `unresolved ${item}`) };
  return { disposition: "validated", reasons: [] };
}

export function applyCandidateEvaluation(world: CurrentValidWorld, nodeId: string, evaluation: CandidateEvaluation): CurrentValidWorld {
  const node = world.work.nodes[nodeId]; if (!node) throw new Error(`Unknown work node: ${nodeId}`);
  if (evaluation.disposition === "validated") {
    const fact = { id: `work:${nodeId}`, provenance: nodeId, statement: `${node.title} validated`, evidenceRefs: [...node.evidenceRefs], fingerprint: world.fingerprint.value, version: (world.facts[`work:${nodeId}`]?.version ?? 0) + 1, status: "validated" as const };
    return { ...releaseOwnership(world, nodeId), revision: world.revision + 1, facts: { ...world.facts, [fact.id]: fact }, work: validateNode(world.work, nodeId), decision: { ...world.decision, valid: false }, evidenceRefs: [...new Set([...world.evidenceRefs, ...node.evidenceRefs])] };
  }
  if (evaluation.disposition === "stale") {
    const { candidate: _candidate, ...rest } = node;
    return { ...releaseOwnership(world, nodeId), revision: world.revision + 1, work: { ...world.work, version: world.work.version + 1, nodes: { ...world.work.nodes, [nodeId]: { ...rest, state: "STALE" } } }, decision: { ...world.decision, valid: false } };
  }
  if (evaluation.disposition === "semantic-verification-required") return world;
  return { ...releaseOwnership(world, nodeId), revision: world.revision + 1, work: rejectNode(world.work, nodeId, evaluation.reasons.join("; "), node.evidenceRefs[0], node.candidate?.approachFingerprint), decision: { ...world.decision, valid: false } };
}
