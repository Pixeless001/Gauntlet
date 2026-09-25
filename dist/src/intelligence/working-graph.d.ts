import type { StructuralIndex } from "./index.js";
import type { InterventionCandidate } from "../control/selector.js";
import type { UncertaintyState } from "../control/uncertainty.js";
export type GraphDepth = "file" | "symbol" | "relation";
export interface WorkingNode {
    path: string;
    reason: string;
    depth: number;
    confidence?: "high" | "medium" | "low";
}
export declare function graphExpansionCandidate(uncertainty: UncertaintyState, available: boolean): InterventionCandidate | null;
export declare function workingGraph(index: StructuralIndex, seeds: string[], maxNodes?: number, maxDepth?: number): WorkingNode[];
export interface GraphExpansion {
    nodes: WorkingNode[];
    symbols: string[];
    relations: {
        from: string;
        to: string;
        kind: "imports" | "dependent" | "test";
    }[];
    truncated: boolean;
}
export declare function ensureDepth(index: StructuralIndex, seeds: string[], depth: GraphDepth, maxNodes?: number): GraphExpansion;
export interface ImpactCone {
    target: string;
    directDependents: string[];
    transitiveDependents: string[];
    affectedTests: string[];
    packageCrossings: string[];
    publicSurface: boolean;
    confidence: "high" | "medium" | "low";
    truncated: boolean;
}
export interface ImpactInspection {
    target: string;
    owner: string | null;
    dependencies: string[];
    callers: string[];
    tests: string[];
    packageCrossings: string[];
    publicSurface: boolean;
    confidence: "high" | "medium" | "low";
    truncated: boolean;
}
export declare function inspectImpact(index: StructuralIndex, target: string, limit?: number): ImpactInspection;
export declare function impact(index: StructuralIndex, target: string, limit?: number): ImpactCone;
