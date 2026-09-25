import type { TaskContract } from "../core/events.js";
import type { CurrentValidWorld, WorldFingerprintInputs } from "./types.js";
type PartialWorldFingerprintInputs = Omit<WorldFingerprintInputs, "config" | "upstream"> & Partial<Pick<WorldFingerprintInputs, "config" | "upstream">>;
export declare function createWorld(contract: TaskContract, canonicalRevision: string | null, inputs: PartialWorldFingerprintInputs): CurrentValidWorld;
export declare function refreshWorld(world: CurrentValidWorld, inputs: PartialWorldFingerprintInputs, canonicalRevision: string | null): CurrentValidWorld;
export declare function refreshValidityInputs(world: CurrentValidWorld, inputs: PartialWorldFingerprintInputs, canonicalRevision: string | null): CurrentValidWorld;
export declare function refreshCapabilities(world: CurrentValidWorld, capabilities: string[]): CurrentValidWorld;
export declare function refreshRules(world: CurrentValidWorld, rules: string[]): CurrentValidWorld;
export {};
