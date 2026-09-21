import { rejectNode, validateNode } from "../work/graph.js";
import type { CurrentValidWorld, WorkNode } from "../work/types.js";

export type CandidateDisposition = "validated" | "rejected" | "stale" | "semantic-verification-required";
export interface DeterministicEvaluation {
  commandPassed: boolean;
  artifactsPresent: boolean;
  staticChecksPassed: boolean;
  testsPassed: boolean;
  acceptanceEvidence: boolean;
  preservationEvidence: boolean;
  ownershipValid: boolean;
  baseCompatible: boolean;
  scopeValid: boolean;
  rulesValid: boolean;
  semanticAmbiguity?: boolean;
}
export interface CandidateEvaluation { disposition: CandidateDisposition; reasons: string[]; }

export function evaluateCandidate(world: CurrentValidWorld, node: WorkNode, evaluation: DeterministicEvaluation): CandidateEvaluation {
  const candidate = node.candidate;
  if (!candidate) return { disposition: "rejected", reasons: ["missing candidate result"] };
  if (candidate.inputFingerprint !== world.fingerprint.value) return { disposition: "stale", reasons: ["candidate input world is stale"] };
  if (!node.dependencies.every((id) => ["VALIDATED", "COLLAPSED"].includes(world.work.nodes[id]?.state ?? ""))) return { disposition: "rejected", reasons: ["work dependency is not validated"] };
  const checks: [boolean, string][] = [
    [evaluation.commandPassed, "command failed"], [evaluation.artifactsPresent, "expected artifact missing"], [evaluation.staticChecksPassed, "static check failed"], [evaluation.testsPassed, "test failed"],
    [evaluation.acceptanceEvidence, "acceptance evidence missing"], [evaluation.preservationEvidence, "preservation evidence missing"], [evaluation.ownershipValid, "write ownership invalid"], [evaluation.baseCompatible, "base revision changed"], [evaluation.scopeValid, "scope violation"], [evaluation.rulesValid, "repository rule violation"],
  ];
  const reasons = checks.filter(([passed]) => !passed).map(([, reason]) => reason);
  if (reasons.length) return { disposition: "rejected", reasons };
  if (candidate.unresolved.length || evaluation.semanticAmbiguity) return { disposition: "semantic-verification-required", reasons: candidate.unresolved.map((item) => `unresolved ${item}`) };
  return { disposition: "validated", reasons: [] };
}

export function applyCandidateEvaluation(world: CurrentValidWorld, nodeId: string, evaluation: CandidateEvaluation): CurrentValidWorld {
  const node = world.work.nodes[nodeId]; if (!node) throw new Error(`Unknown work node: ${nodeId}`);
  if (evaluation.disposition === "validated") return { ...world, revision: world.revision + 1, work: validateNode(world.work, nodeId), decision: { ...world.decision, valid: false }, evidenceRefs: [...new Set([...world.evidenceRefs, ...node.evidenceRefs])] };
  if (evaluation.disposition === "stale") {
    const { candidate: _candidate, ...rest } = node;
    return { ...world, revision: world.revision + 1, work: { ...world.work, version: world.work.version + 1, nodes: { ...world.work.nodes, [nodeId]: { ...rest, state: "STALE" } } }, decision: { ...world.decision, valid: false } };
  }
  if (evaluation.disposition === "semantic-verification-required") return world;
  return { ...world, revision: world.revision + 1, work: rejectNode(world.work, nodeId, evaluation.reasons.join("; ")), decision: { ...world.decision, valid: false } };
}
