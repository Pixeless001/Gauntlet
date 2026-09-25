import type { ConventionFact } from "./conventions.js";
export type RuleTiming = "edit" | "turn" | "before_stop";
export type RuleEnforcement = "deterministic" | "structural" | "instruction";
export interface RepositoryRule {
    id: string;
    instruction: string;
    timing: RuleTiming;
    enforcement: RuleEnforcement;
    sourceRefs: string[];
}
export declare function compileRules(facts: ConventionFact[]): RepositoryRule[];
export declare function actionableRules(rules: RepositoryRule[], timing: RuleTiming): RepositoryRule[];
