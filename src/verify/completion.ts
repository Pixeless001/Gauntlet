import type { TaskContract } from "../core/events.js";
import type { Finding } from "../core/events.js";
import type { UncertaintyState } from "../control/uncertainty.js";
import { unresolved } from "../control/uncertainty.js";
import type { ProofKind } from "./proof-selector.js";
import type { CurrentValidWorld } from "../work/types.js";
import { decisionIsFresh } from "../work/graph.js";

export interface CompletionDecision { status: "complete" | "incomplete" | "semantic-verification-required"; reasons: string[]; missingInvariants?: string[]; missingProof: ProofKind[]; proofRefs?: string[] }

export function decideCompletion(contract: TaskContract, findings: Finding[], uncertainty: UncertaintyState, supplied: ProofKind[], world?: CurrentValidWorld): CompletionDecision {
  const available = new Set(supplied), missingProof = requiredPreservationProof(contract).filter((kind) => !available.has(kind));
  const material = unresolved(uncertainty).filter((kind) => kind !== "visual" && kind !== "performance" || requiredPreservationProof(contract).includes(kind === "visual" ? "browser" : "measurement"));
  const reasons = [
    ...findings.filter((item) => item.blocking ?? item.severity === "error").map((item) => item.message),
    ...material.map((kind) => `unresolved ${kind}`),
    ...missingProof.map((kind) => `missing preservation ${kind}`),
    ...(world ? Object.values(world.work.nodes).filter((node) => node.required && !["VALIDATED", "COLLAPSED"].includes(node.state)).map((node) => `required node ${node.id} is ${node.state.toLowerCase()}`) : []),
    ...(world?.facts ? Object.values(world.facts).filter((fact) => fact.status === "stale").map((fact) => `stale fact ${fact.id}`) : []),
    ...(world && !decisionIsFresh(world) ? ["action menu is stale"] : []),
  ];
  const semantic = world && Object.values(world.work.nodes).some((node) => node.state === "CANDIDATE" && (node.candidate?.unresolved.length ?? 0) > 0);
  const missingInvariants = [...new Set(reasons)], proofRefs = [...new Set([...findings.flatMap((finding) => finding.proof), ...(world?.evidenceRefs ?? [])])];
  return { status: semantic ? "semantic-verification-required" : missingInvariants.length ? "incomplete" : "complete", reasons: missingInvariants, missingInvariants, missingProof: [...new Set(missingProof)], proofRefs };
}

export function requiredPreservationProof(contract: TaskContract): ProofKind[] {
  const text = contract.preservationRequirements.join(" ").toLowerCase(), required: ProofKind[] = [];
  if (/api|public|compatib/.test(text)) required.push("graph", "test");
  if (/data|schema|migration|security|auth|permission|concurr|race|atomic/.test(text)) required.push("test");
  if (/performance|latency|throughput|memory/.test(text)) required.push("measurement");
  for (const item of contract.requiredProof) {
    if (/test/.test(item.toLowerCase())) required.push("test");
    if (/typecheck|lint|build|diff/.test(item.toLowerCase())) required.push("diff");
  }
  return [...new Set(required)];
}
