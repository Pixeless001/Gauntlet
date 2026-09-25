import { z } from "zod";
import type { TaskContract } from "../core/events.js";
import type { RepoIndex } from "./index.js";
export declare const conventionStrength: z.ZodEnum<{
    medium: "medium";
    strong: "strong";
    weak: "weak";
}>;
declare const factSchema: z.ZodObject<{
    id: z.ZodString;
    category: z.ZodEnum<{
        api: "api";
        architecture: "architecture";
        primitive: "primitive";
        testing: "testing";
        tooling: "tooling";
    }>;
    value: z.ZodString;
    strength: z.ZodEnum<{
        medium: "medium";
        strong: "strong";
        weak: "weak";
    }>;
    scope: z.ZodString;
    sourceRefs: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        fingerprint: z.ZodString;
    }, z.core.$strip>>;
    representatives: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
declare const profileSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    facts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        category: z.ZodEnum<{
            api: "api";
            architecture: "architecture";
            primitive: "primitive";
            testing: "testing";
            tooling: "tooling";
        }>;
        value: z.ZodString;
        strength: z.ZodEnum<{
            medium: "medium";
            strong: "strong";
            weak: "weak";
        }>;
        scope: z.ZodString;
        sourceRefs: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            fingerprint: z.ZodString;
        }, z.core.$strip>>;
        representatives: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ConventionFact = z.infer<typeof factSchema>;
export type RepoConventionProfile = z.infer<typeof profileSchema>;
export interface ConventionBudget {
    maxFiles: number;
    maxBytes: number;
    maxFacts: number;
    maxSearchResults: number;
}
export declare const DEFAULT_CONVENTION_BUDGET: ConventionBudget;
export declare class ConventionCache {
    private readonly cwd;
    readonly path: string;
    constructor(cwd: string);
    load(): Promise<RepoConventionProfile>;
    save(profile: RepoConventionProfile): Promise<void>;
}
export declare function dependencyCapability(name: string): string | null;
export declare function discoverConventions(cwd: string, touched?: string[], budget?: ConventionBudget, index?: RepoIndex): Promise<RepoConventionProfile>;
export declare function selectConventionFacts(profile: RepoConventionProfile, contract: TaskContract, limit?: number): {
    id: string;
    category: "api" | "architecture" | "primitive" | "testing" | "tooling";
    value: string;
    strength: "medium" | "strong" | "weak";
    scope: string;
    sourceRefs: {
        path: string;
        fingerprint: string;
    }[];
    representatives: string[];
}[];
export declare function relativeScope(cwd: string, path: string): string;
export declare function testPlacementConflict(fact: ConventionFact, path: string): boolean;
export declare function isSharedPrimitive(path: string): boolean;
export {};
