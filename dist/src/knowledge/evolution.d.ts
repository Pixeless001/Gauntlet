import type { EvalComparison } from "../measure/evals.js";
import type { ExperiencePattern, PatternKind } from "./patterns.js";
export interface BehaviorProposal {
    id: string;
    kind: PatternKind;
    patternId: string;
    summary: string;
    evaluationCases: string[];
}
export interface EvolutionDecision {
    retainBehavior: boolean;
    pattern: ExperiencePattern;
    reason: string;
}
/** Produce at most one atomic proposal from supported knowledge. Runtime tasks never call this function. */
export declare function proposeAtomicChange(patterns: ExperiencePattern[]): BehaviorProposal | null;
export declare function evaluateProposal(pattern: ExperiencePattern, proposal: BehaviorProposal, results: EvalComparison[]): EvolutionDecision;
export declare function runEvolution(cwd: string, dryRun?: boolean): Promise<{
    status: "no-proposal" | "promoted" | "rejected" | "dry-run";
    proposal?: BehaviorProposal;
    path?: string;
}>;
