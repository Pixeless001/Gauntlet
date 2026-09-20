import type { EvalComparison } from "../measure/evals.js";
import { eligibleForPromotion } from "../measure/evals.js";
import type { ExperiencePattern, PatternKind } from "./patterns.js";

export interface BehaviorProposal { id: string; kind: PatternKind; patternId: string; summary: string; evaluationCases: string[] }
export interface EvolutionDecision { retainBehavior: boolean; pattern: ExperiencePattern; reason: string }

/** Produce at most one atomic proposal from supported knowledge. Runtime tasks never call this function. */
export function proposeAtomicChange(patterns: ExperiencePattern[]): BehaviorProposal | null {
  const candidate = patterns.filter((item) => item.status === "supported" && item.supportingProof.length > item.contradictingProof.length).sort((a, b) => b.supportingProof.length - a.supportingProof.length || a.id.localeCompare(b.id))[0];
  return candidate ? { id: `proposal:${candidate.id}`, kind: candidate.kind, patternId: candidate.id, summary: candidate.summary, evaluationCases: [...candidate.taskClasses] } : null;
}

export function evaluateProposal(pattern: ExperiencePattern, proposal: BehaviorProposal, results: EvalComparison[]): EvolutionDecision {
  if (proposal.patternId !== pattern.id) throw new Error("Proposal does not match its proof pattern");
  const retainBehavior = eligibleForPromotion(results), now = new Date().toISOString();
  return { retainBehavior, reason: retainBehavior ? "Evaluation improved without regressions" : "Evaluation did not earn behavior promotion", pattern: { ...pattern, status: retainBehavior ? "promoted" : "supported", updatedAt: now } };
}
