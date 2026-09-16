import type { CapabilityKind } from "../capabilities/registry.js";
import type { TaskState } from "../core/task-state.js";
import type { UncertaintyKind } from "./uncertainty.js";
import type { InterventionCandidate } from "./selector.js";

export interface CapabilityActivation { kind: CapabilityKind; uncertainty: UncertaintyKind; reason: string }

export function requiredCapabilities(state: TaskState): CapabilityActivation[] {
  const uncertainty = state.session?.uncertainty; if (!uncertainty) return [];
  const activations: CapabilityActivation[] = [];
  if (uncertainty.api === "open" && (state.session?.exhaustedEscalation?.api ?? 0) >= 3) activations.push({ kind: "docs", uncertainty: "api", reason: "Local package evidence was insufficient" });
  if (uncertainty.visual === "open") activations.push({ kind: "browser", uncertainty: "visual", reason: "Rendered acceptance remains unverified" });
  if ((state.session?.interventionsUsed ?? 0) < state.session!.budget.interventions && state.attempts > 2 && uncertainty.cause === "open" && (state.session?.exhaustedEscalation?.cause ?? 0) >= 4) activations.push({ kind: "delegation", uncertainty: "cause", reason: "Repeated high-risk work remains unresolved" });
  return activations;
}

export function capabilityCandidates(state: TaskState, available: Partial<Record<CapabilityKind, boolean>> = {}): InterventionCandidate[] {
  return requiredCapabilities(state).map((activation) => ({
    id: `capability:${activation.kind}`, kind: "capability", uncertainty: activation.uncertainty, resolves: [activation.uncertainty],
    level: activation.kind === "delegation" ? 5 : 4, cost: activation.kind === "delegation" ? "high" : "medium",
    authority: activation.kind === "docs" ? "external" : "runtime", source: activation.kind, reason: activation.reason,
    available: available[activation.kind] === true,
  }));
}
