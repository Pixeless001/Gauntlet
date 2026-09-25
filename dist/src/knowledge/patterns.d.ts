export type PatternStatus = "observed" | "supported" | "promoted";
export type PatternKind = "skill" | "selector" | "repository-rule" | "proof-policy" | "context-policy" | "reference";
export interface ExperiencePattern {
    id: string;
    kind: PatternKind;
    status: PatternStatus;
    summary: string;
    taskClasses: string[];
    supportingProof: string[];
    contradictingProof: string[];
    repositoryFingerprint?: string;
    updatedAt: string;
}
export declare class PatternStore {
    private readonly path;
    constructor(cwd: string);
    list(): Promise<ExperiencePattern[]>;
    put(pattern: ExperiencePattern): Promise<void>;
}
