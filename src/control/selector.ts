import type { InterventionBudget } from "../core/policy.js";
import type { SkillName } from "../core/skills.js";
import type { UncertaintyKind, UncertaintyState } from "./uncertainty.js";

export type EscalationLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type CostClass = "tiny" | "low" | "medium" | "high";
export type RejectionReason = "resolved" | "irrelevant" | "duplicate" | "unavailable" | "dominated" | "budget_exceeded";
export interface InterventionCandidate { id: string; skill?: SkillName; uncertainty: UncertaintyKind; level: EscalationLevel; cost: CostClass; available: boolean }
export interface SelectionTrace { event: number; trigger: string; candidates: string[]; selected: string[]; rejected: { id: string; reason: RejectionReason }[] }

export function selectInterventions(input: { uncertainty: UncertaintyState; candidates: InterventionCandidate[]; supplied: string[]; budget: InterventionBudget; used: number; event: number; trigger: string }): SelectionTrace {
  const selected: string[] = [], rejected: SelectionTrace["rejected"] = [];
  const ordered = [...input.candidates].sort((a, b) => a.level - b.level || cost(a.cost) - cost(b.cost) || a.id.localeCompare(b.id));
  for (const candidate of ordered) {
    const state = input.uncertainty[candidate.uncertainty];
    if (state === "resolved") { rejected.push({ id: candidate.id, reason: "resolved" }); continue; }
    if (state === "irrelevant") { rejected.push({ id: candidate.id, reason: "irrelevant" }); continue; }
    if (!candidate.available) { rejected.push({ id: candidate.id, reason: "unavailable" }); continue; }
    if (input.supplied.includes(candidate.id) || selected.includes(candidate.id)) { rejected.push({ id: candidate.id, reason: "duplicate" }); continue; }
    if (selected.some((id) => ordered.find((item) => item.id === id)?.uncertainty === candidate.uncertainty)) { rejected.push({ id: candidate.id, reason: "dominated" }); continue; }
    if (input.used + selected.length >= input.budget.interventions) { rejected.push({ id: candidate.id, reason: "budget_exceeded" }); continue; }
    selected.push(candidate.id);
  }
  return { event: input.event, trigger: input.trigger, candidates: ordered.map((item) => item.id), selected, rejected };
}

function cost(value: CostClass): number { return { tiny: 0, low: 1, medium: 2, high: 3 }[value]; }
