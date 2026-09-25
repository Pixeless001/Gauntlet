export type CapabilityKind = "search" | "output" | "execution" | "docs" | "browser" | "delegation" | "registry" | "reference" | "skill";
export type CapabilitySource = "repository" | "host" | "installed" | "gauntlet";
export interface Capability<T = unknown> {
    id: string;
    kind: CapabilityKind;
    source: CapabilitySource;
    available: boolean;
    value: () => T;
    version?: string;
    escalation?: 0 | 1 | 2 | 3 | 4 | 5;
    cost?: "tiny" | "low" | "medium" | "high";
    resolves?: string[];
    stopWhen?: string;
}
export declare class CapabilityRegistry {
    private readonly entries;
    register<T>(capability: Capability<T>): void;
    candidates<T>(kind: CapabilityKind): Capability<T>[];
    all(): Capability[];
}
