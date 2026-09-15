import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";

export type EvidenceKind = "contract" | "search" | "graph" | "reproduction" | "repository_rule" | "installed_api" | "test" | "diff" | "browser" | "measurement";
export const evidenceMap: Record<UncertaintyKind, EvidenceKind[]> = {
  intent: ["contract"], location: ["search", "graph"], cause: ["reproduction", "test"], repoFit: ["repository_rule", "graph"], api: ["installed_api"], behavior: ["test"], regression: ["graph", "test"], scope: ["diff", "graph"], visual: ["browser"], performance: ["measurement"],
};

export function remainingEvidence(uncertainty: UncertaintyState, supplied: EvidenceKind[]): { uncertainty: UncertaintyKind; evidence: EvidenceKind }[] {
  const available = new Set(supplied), result: { uncertainty: UncertaintyKind; evidence: EvidenceKind }[] = [];
  for (const [kind, state] of Object.entries(uncertainty) as [UncertaintyKind, UncertaintyState[UncertaintyKind]][]) {
    if (state !== "open" && state !== "partial") continue;
    if (evidenceMap[kind].some((evidence) => available.has(evidence))) continue;
    result.push({ uncertainty: kind, evidence: evidenceMap[kind][0]! });
  }
  return result;
}
