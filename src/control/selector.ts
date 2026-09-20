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
export interface SelectedIntervention { id: string; kind: CandidateKind; resolves: UncertaintyKind[]; uncertainty: UncertaintyKind; level: EscalationLevel; cost: CostClass; authority: ProofAuthority; source: string; reason: string }
export interface SelectionTrace { event: number; trigger: string; candidates: string[]; selected: string[]; activations: SelectedIntervention[]; rejected: { id: string; reason: RejectionReason }[]; changedState?: boolean; proofFound?: boolean }
export interface ActivationPlan {
  skills: InterventionCandidate[];
  context: InterventionCandidate[];
  proof: InterventionCandidate[];
  capabilities: InterventionCandidate[];
  references: InterventionCandidate[];
  graphExpansions: InterventionCandidate[];
  trace: SelectionTrace;
}

export function selectInterventions(input: { uncertainty: UncertaintyState; candidates: InterventionCandidate[]; supplied: string[]; budget: InterventionBudget; used: number; event: number; trigger: string }): SelectionTrace {
  const selected: string[] = [], rejected: SelectionTrace["rejected"] = [];
  const ordered = [...input.candidates].sort((a, b) => a.level - b.level || authority(a.authority) - authority(b.authority) || cost(a.cost) - cost(b.cost) || scope(a.scope) - scope(b.scope) || (b.directness ?? 0) - (a.directness ?? 0) || Number(a.reversible === false) - Number(b.reversible === false) || a.id.localeCompare(b.id));
  for (const candidate of ordered) {
    const resolves = targets(candidate), states = resolves.map((kind) => input.uncertainty[kind]);
    if (states.every((state) => state === "resolved")) { rejected.push({ id: candidate.id, reason: "resolved" }); continue; }
    if (states.every((state) => state === "irrelevant")) { rejected.push({ id: candidate.id, reason: "irrelevant" }); continue; }
    if (!candidate.available) { rejected.push({ id: candidate.id, reason: "unavailable" }); continue; }
    if (input.supplied.includes(candidate.id) || candidate.fingerprint && input.supplied.includes(`source:${candidate.fingerprint}`) || selected.includes(candidate.id)) { rejected.push({ id: candidate.id, reason: "duplicate" }); continue; }
    const covered = new Set(selected.flatMap((id) => contributions(ordered.find((item) => item.id === id)!)));
    if (contributions(candidate).every((claim) => covered.has(claim)) || resolves.every((kind) => input.uncertainty[kind] === "resolved" || input.uncertainty[kind] === "irrelevant")) { rejected.push({ id: candidate.id, reason: "dominated" }); continue; }
    if (input.used + selected.length >= input.budget.interventions) { rejected.push({ id: candidate.id, reason: "budget_exceeded" }); continue; }
    const selectedCandidates = selected.map((id) => ordered.find((item) => item.id === id)!);
    if (candidateKind(candidate) === "skill" && selectedCandidates.filter((item) => candidateKind(item) === "skill").length >= input.budget.skillInvocations) { rejected.push({ id: candidate.id, reason: "budget_exceeded" }); continue; }
    if (expensive(candidate) && selectedCandidates.filter(expensive).length >= input.budget.expensiveChecks) { rejected.push({ id: candidate.id, reason: "budget_exceeded" }); continue; }
    selected.push(candidate.id);
  }
  return { event: input.event, trigger: input.trigger, candidates: ordered.map((item) => item.id), selected, activations: selected.map((id) => activation(ordered.find((candidate) => candidate.id === id)!)), rejected };
}

export function planActivation(input: Parameters<typeof selectInterventions>[0]): ActivationPlan {
  const trace = selectInterventions(input), selected = new Set(trace.selected), candidates = input.candidates.filter((candidate) => selected.has(candidate.id));
  const ofKind = (kind: CandidateKind) => candidates.filter((candidate) => candidateKind(candidate) === kind);
  return { skills: ofKind("skill"), context: ofKind("context"), proof: ofKind("proof"), capabilities: ofKind("capability"), references: ofKind("reference"), graphExpansions: ofKind("graph-expansion"), trace };
}

function cost(value: CostClass): number { return { tiny: 0, low: 1, medium: 2, high: 3 }[value]; }
function scope(value: InterventionCandidate["scope"] = "local"): number { return { tiny: 0, local: 1, distributed: 2, systemic: 3 }[value]; }
function authority(value: ProofAuthority = "local"): number { return { repository: 0, local: 1, runtime: 2, cached: 3, external: 4 }[value]; }
function expensive(candidate: InterventionCandidate): boolean { return candidate.level >= 4 || candidate.cost === "high"; }
function targets(candidate: InterventionCandidate): UncertaintyKind[] { return [...new Set(candidate.resolves?.length ? candidate.resolves : [candidate.uncertainty])]; }
function contributions(candidate: InterventionCandidate): string[] { return [...new Set(candidate.contributions?.length ? candidate.contributions : targets(candidate).map((target) => `uncertainty:${target}`))]; }
function candidateKind(candidate: InterventionCandidate): CandidateKind { return candidate.kind ?? (candidate.skill ? "skill" : "proof"); }
function activation(candidate: InterventionCandidate): SelectedIntervention {
  return { id: candidate.id, kind: candidateKind(candidate), resolves: targets(candidate), uncertainty: candidate.uncertainty, level: candidate.level, cost: candidate.cost, authority: candidate.authority ?? "local", source: candidate.source ?? candidate.id, reason: candidate.reason ?? "Resolves remaining uncertainty" };
}
