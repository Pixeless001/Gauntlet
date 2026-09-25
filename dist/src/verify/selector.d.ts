import type { RepoProfile } from "../repo/detect.js";
import type { FileDelta } from "../core/task-state.js";
import type { VerificationPlan } from "./types.js";
import type { StructuralIndex } from "../intelligence/index.js";
import type { UncertaintyState } from "../control/uncertainty.js";
import { type InterventionCandidate } from "../control/selector.js";
import type { InterventionBudget } from "../core/policy.js";
export declare function selectVerification(profile: RepoProfile, changes: FileDelta[], files?: string[], structural?: StructuralIndex, control?: {
    uncertainty: UncertaintyState;
    budget: InterventionBudget;
    event: number;
}): VerificationPlan;
export declare function verificationCandidates(plan: VerificationPlan): InterventionCandidate[];
