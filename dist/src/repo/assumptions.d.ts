import type { RepoIndex } from "./index.js";
export type ProofKind = "repository-usage" | "installed-types" | "package-version" | "local-docs" | "external-required";
export interface Assumption {
    packageName: string;
    symbol?: string;
}
export interface AssumptionResolution {
    assumption: Assumption;
    resolved: boolean;
    kind: ProofKind;
    proof: string[];
    fingerprint?: string;
}
export declare function resolveAssumption(cwd: string, assumption: Assumption, index: RepoIndex, maxFiles?: number, maxBytes?: number): Promise<AssumptionResolution>;
