import type { CandidateResult } from "./types.js";

export interface CandidateReduction { claims: string[]; evidenceRefs: string[]; artifacts: string[]; conflicts: string[]; }
export interface SemanticSynthesisRequest { conflicts: string[]; candidates: Pick<CandidateResult, "nodeId" | "attempt" | "claims" | "evidenceRefs" | "affectedPaths">[] }

export function reduceCandidates(candidates: CandidateResult[]): CandidateReduction {
  const ordered = [...candidates].sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.attempt - right.attempt), byPath = new Map<string, CandidateResult>(), conflicts = new Set<string>();
  for (const candidate of ordered) for (const path of candidate.affectedPaths) {
    const existing = byPath.get(path);
    if (existing && JSON.stringify(existing.claims) !== JSON.stringify(candidate.claims)) conflicts.add(path); else byPath.set(path, candidate);
  }
  const accepted = ordered.filter((candidate) => !candidate.affectedPaths.some((path) => conflicts.has(path)));
  return { claims: unique(accepted.flatMap((candidate) => candidate.claims)), evidenceRefs: unique(accepted.flatMap((candidate) => candidate.evidenceRefs)), artifacts: unique(accepted.flatMap((candidate) => candidate.artifactRefs)), conflicts: [...conflicts].sort() };
}

export function semanticSynthesisRequest(candidates: CandidateResult[]): SemanticSynthesisRequest | null {
  const reduction = reduceCandidates(candidates);
  if (!reduction.conflicts.length) return null;
  return { conflicts: reduction.conflicts, candidates: candidates.filter((candidate) => candidate.affectedPaths.some((path) => reduction.conflicts.includes(path))).sort((left, right) => left.nodeId.localeCompare(right.nodeId)).slice(0, 4).map(({ nodeId, attempt, claims, evidenceRefs, affectedPaths }) => ({ nodeId, attempt, claims: [...claims], evidenceRefs: [...evidenceRefs], affectedPaths: [...affectedPaths] })) };
}

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
