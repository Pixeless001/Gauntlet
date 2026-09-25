import type { InterventionBudget } from "../core/policy.js";
import type { SkillName } from "../core/skills.js";
import type { UncertaintyKind, UncertaintyState } from "./uncertainty.js";
export type EscalationLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type CostClass = "tiny" | "low" | "medium" | "high";
export type CandidateKind = "skill" | "context" | "proof" | "capability" | "reference" | "graph-expansion";
export type ProofAuthority = "cached" | "repository" | "local" | "runtime" | "external";
export type RejectionReason = "resolved" | "irrelevant" | "duplicate" | "unavailable" | "dominated" | "budget_exceeded";
export interface InterventionCandidate {
    id: string;
    kind?: CandidateKind;
    skill?: SkillName;
    uncertainty: UncertaintyKind;
    resolves?: UncertaintyKind[];
    level: EscalationLevel;
    cost: CostClass;
    authority?: ProofAuthority;
    source?: string;
    reason?: string;
    contributions?: string[];
    available: boolean;
    scope?: "tiny" | "local" | "distributed" | "systemic";
    directness?: number;
    reversible?: boolean;
    fingerprint?: string;
}
export interface SelectedIntervention {
    id: string;
    kind: CandidateKind;
    resolves: UncertaintyKind[];
    uncertainty: UncertaintyKind;
    level: EscalationLevel;
    cost: CostClass;
    authority: ProofAuthority;
    source: string;
    reason: string;
}
export interface SelectionTrace {
    event: number;
    trigger: string;
    candidates: string[];
    selected: string[];
    activations: SelectedIntervention[];
    rejected: {
        id: string;
        reason: RejectionReason;
    }[];
    changedState?: boolean;
    proofFound?: boolean;
}
export interface ActivationPlan {
    skills: InterventionCandidate[];
    context: InterventionCandidate[];
    proof: InterventionCandidate[];
    capabilities: InterventionCandidate[];
    references: InterventionCandidate[];
    graphExpansions: InterventionCandidate[];
    trace: SelectionTrace;
}
export declare function selectInterventions(input: {
    uncertainty: UncertaintyState;
    candidates: InterventionCandidate[];
    supplied: string[];
    budget: InterventionBudget;
    used: number;
    event: number;
    trigger: string;
}): SelectionTrace;
export declare function planActivation(input: Parameters<typeof selectInterventions>[0]): ActivationPlan;
