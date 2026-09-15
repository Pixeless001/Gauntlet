import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";

export type EvidenceKind = "contract" | "search" | "graph" | "reproduction" | "repository_rule" | "installed_api" | "test" | "diff" | "browser" | "measurement";
export const evidenceRequirements: Record<UncertaintyKind, EvidenceKind[][]> = {
  intent: [["contract"]], location: [["search"], ["graph"]], cause: [["reproduction"], ["test"]], repoFit: [["repository_rule"], ["graph"]], api: [["installed_api"]], behavior: [["test"]], regression: [["graph", "test"]], scope: [["diff"]], visual: [["browser"]], performance: [["measurement"]],
};
export const evidenceMap: Record<UncertaintyKind, EvidenceKind[]> = Object.fromEntries(Object.entries(evidenceRequirements).map(([kind, alternatives]) => [kind, [...new Set(alternatives.flat())]])) as Record<UncertaintyKind, EvidenceKind[]>;

export function hasSufficientEvidence(kind: UncertaintyKind, supplied: Iterable<EvidenceKind>): boolean {
  const available = supplied instanceof Set ? supplied : new Set(supplied);
  return evidenceRequirements[kind].some((requirement) => requirement.every((evidence) => available.has(evidence)));
}

export function remainingEvidence(uncertainty: UncertaintyState, supplied: EvidenceKind[]): { uncertainty: UncertaintyKind; evidence: EvidenceKind }[] {
  const available = new Set(supplied), result: { uncertainty: UncertaintyKind; evidence: EvidenceKind }[] = [];
  for (const [kind, state] of Object.entries(uncertainty) as [UncertaintyKind, UncertaintyState[UncertaintyKind]][]) {
    if (state !== "open" && state !== "partial") continue;
    if (hasSufficientEvidence(kind, available)) continue;
    const closest = evidenceRequirements[kind].map((requirement) => requirement.filter((evidence) => !available.has(evidence))).sort((a, b) => a.length - b.length)[0]!;
    result.push({ uncertainty: kind, evidence: closest[0]! });
  }
  return result;
}
