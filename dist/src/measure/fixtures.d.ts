import type { SkillName } from "../core/skills.js";
export interface ArchitectureFixture {
    id: string;
    intent: string;
    acceptance: string[];
    preservation: string[];
    expectedSkills: SkillName[];
    forbiddenActivations: ("browser" | "delegation" | "external-docs" | "graph-expansion")[];
    maximumEscalation: 0 | 1 | 2 | 3 | 4 | 5;
    contextBudget: number;
    sufficientProof: string[];
    stopCondition: string;
}
/** Deterministic architecture cases. Repository-backed variants can supply files around the same contracts. */
export declare const ARCHITECTURE_FIXTURES: readonly ArchitectureFixture[];
