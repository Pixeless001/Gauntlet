import type { TaskContract } from "./events.js";
import type { FileDelta } from "./task-state.js";
export type TaskRisk = "minimal" | "ordinary" | "elevated";
export interface RiskAssessment {
    level: TaskRisk;
    reasons: string[];
}
export declare function assessRisk(contract: TaskContract, changes?: FileDelta[]): RiskAssessment;
