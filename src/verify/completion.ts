import type { TaskContract } from "../core/events.js";
import type { Finding } from "../core/events.js";
import type { UncertaintyState } from "../control/uncertainty.js";
import { unresolved } from "../control/uncertainty.js";
import type { ProofKind } from "./proof-selector.js";

export interface CompletionDecision { status: "complete" | "incomplete"; reasons: string[]; missingProof: ProofKind[] }

export function decideCompletion(contract: TaskContract, findings: Finding[], uncertainty: UncertaintyState, supplied: ProofKind[]): CompletionDecision {
  const available = new Set(supplied), missingProof = requiredPreservationProof(contract).filter((kind) => !available.has(kind));
  const material = unresolved(uncertainty).filter((kind) => kind !== "visual" && kind !== "performance" || requiredPreservationProof(contract).includes(kind === "visual" ? "browser" : "measurement"));
  const reasons = [
    ...findings.filter((item) => item.blocking ?? item.severity === "error").map((item) => item.message),
    ...material.map((kind) => `unresolved ${kind}`),
    ...missingProof.map((kind) => `missing preservation ${kind}`),
  ];
  return { status: reasons.length ? "incomplete" : "complete", reasons: [...new Set(reasons)], missingProof: [...new Set(missingProof)] };
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
