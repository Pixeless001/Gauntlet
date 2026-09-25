import type { TaskContract } from "../core/events.js";
import type { RepoProfile } from "../repo/detect.js";
import type { InterventionCandidate } from "../control/selector.js";
export type Domain = "react" | "database" | "ui" | "web-discovery";
export interface DomainDecision {
    detected: Domain[];
    active: Domain[];
}
export declare function resolveDomains(profile: RepoProfile, contract: TaskContract): DomainDecision;
export declare function domainCandidates(profile: RepoProfile, contract: TaskContract, available?: Partial<Record<Domain, boolean>>): InterventionCandidate[];
