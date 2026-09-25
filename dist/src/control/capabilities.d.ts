import type { CapabilityKind } from "../capabilities/registry.js";
import type { TaskState } from "../core/task-state.js";
import type { UncertaintyKind } from "./uncertainty.js";
import type { InterventionCandidate } from "./selector.js";
export interface CapabilityActivation {
    kind: CapabilityKind;
    uncertainty: UncertaintyKind;
    reason: string;
}
export declare function requiredCapabilities(state: TaskState): CapabilityActivation[];
export declare function capabilityCandidates(state: TaskState, available?: Partial<Record<CapabilityKind, boolean>>): InterventionCandidate[];
