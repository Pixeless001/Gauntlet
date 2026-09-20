import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";

export type ProofKind = "contract" | "search" | "graph" | "reproduction" | "repository_rule" | "installed_api" | "test" | "diff" | "browser" | "measurement";
export const proofRequirements: Record<UncertaintyKind, ProofKind[][]> = {
  intent: [["contract"]], location: [["search"], ["graph"]], cause: [["reproduction"], ["test"]], repoFit: [["repository_rule"], ["graph"]], api: [["installed_api"]], behavior: [["test"]], regression: [["graph", "test"]], scope: [["diff"]], visual: [["browser"]], performance: [["measurement"]],
};
export const proofMap: Record<UncertaintyKind, ProofKind[]> = Object.fromEntries(Object.entries(proofRequirements).map(([kind, alternatives]) => [kind, [...new Set(alternatives.flat())]])) as Record<UncertaintyKind, ProofKind[]>;

export function hasSufficientProof(kind: UncertaintyKind, supplied: Iterable<ProofKind>): boolean {
  const available = supplied instanceof Set ? supplied : new Set(supplied);
  return proofRequirements[kind].some((requirement) => requirement.every((proof) => available.has(proof)));
}

export function remainingProof(uncertainty: UncertaintyState, supplied: ProofKind[], obtainable?: ProofKind[]): { uncertainty: UncertaintyKind; proof: ProofKind }[] {
  const available = new Set(supplied), paths = obtainable ? new Set([...supplied, ...obtainable]) : null, result: { uncertainty: UncertaintyKind; proof: ProofKind }[] = [];
  for (const [kind, state] of Object.entries(uncertainty) as [UncertaintyKind, UncertaintyState[UncertaintyKind]][]) {
    if (state !== "open" && state !== "partial") continue;
    if (hasSufficientProof(kind, available)) continue;
    if (paths && !proofRequirements[kind].some((requirement) => requirement.every((proof) => paths.has(proof)))) continue;
    const closest = proofRequirements[kind].map((requirement) => requirement.filter((proof) => !available.has(proof))).sort((a, b) => a.length - b.length)[0]!;
    result.push({ uncertainty: kind, proof: closest[0]! });
  }
  return result;
}
