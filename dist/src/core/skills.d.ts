import type { TaskContract } from "./events.js";
import type { TaskRisk } from "./risk.js";
import type { InterventionCandidate } from "../control/selector.js";
export type SkillName = "understand" | "investigate" | "implement" | "verify" | "review" | "optimize";
export declare function routeSkills(contract: TaskContract, phase: "start" | "activity" | "before_stop", risk: TaskRisk, repeatedFailure?: boolean): SkillName[];
export declare function skillCandidates(contract: TaskContract, phase: "start" | "activity" | "before_stop", risk: TaskRisk, repeatedFailure?: boolean): InterventionCandidate[];
export declare function loadSkill(name: SkillName): Promise<string>;
