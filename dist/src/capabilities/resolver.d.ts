import type { Capability, CapabilityKind } from "./registry.js";
import { CapabilityRegistry } from "./registry.js";
export interface Resolution<T> {
    capability: Capability<T> | null;
    conflicts: string[];
}
export declare class CapabilityResolver {
    private readonly registry;
    private readonly overrides;
    constructor(registry: CapabilityRegistry, overrides?: Partial<Record<CapabilityKind, string>>);
    resolve<T>(kind: CapabilityKind): Resolution<T>;
}
