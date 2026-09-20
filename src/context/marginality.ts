type ContributionKind = "owner" | "caller" | "dependency" | "interface" | "invariant" | "acceptance" | "contradiction" | "proof";
export type Contribution = ContributionKind | `${ContributionKind}:${string}`;
export interface ContextCandidate<T> { value: T; contributions: Contribution[]; cost: number }

export function selectMarginal<T>(candidates: ContextCandidate<T>[], budget: number): { selected: T[]; rejected: T[] } {
  const known = new Set<Contribution>(), selected: T[] = [], rejected: T[] = []; let used = 0;
  for (const candidate of candidates) {
    const adds = candidate.contributions.some((value) => !known.has(value));
    if (!adds || used + candidate.cost > budget) { rejected.push(candidate.value); continue; }
    selected.push(candidate.value); used += candidate.cost; for (const value of candidate.contributions) known.add(value);
  }
  return { selected, rejected };
}
