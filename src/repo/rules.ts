import type { ConventionFact } from "./conventions.js";

export type RuleTiming = "edit" | "turn" | "before_stop";
export type RuleEnforcement = "deterministic" | "structural" | "instruction";
export interface RepositoryRule { id: string; instruction: string; timing: RuleTiming; enforcement: RuleEnforcement; sourceRefs: string[] }

export function compileRules(facts: ConventionFact[]): RepositoryRule[] {
  return facts.map((fact) => ({
    id: fact.id,
    instruction: fact.value,
    timing: fact.category === "architecture" || fact.category === "testing" ? "before_stop" : fact.category === "api" ? "edit" : "turn",
    enforcement: fact.category === "architecture" ? "structural" : fact.category === "tooling" || fact.category === "testing" ? "deterministic" : "instruction",
    sourceRefs: fact.sourceRefs.map((item) => `${item.path}#${item.fingerprint}`),
  }));
}

export function actionableRules(rules: RepositoryRule[], timing: RuleTiming): RepositoryRule[] { return rules.filter((rule) => rule.timing === timing); }
