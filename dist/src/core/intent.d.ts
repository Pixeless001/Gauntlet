import type { TaskContract } from "./events.js";
export interface ContractInspection {
    files?: string[];
    dependencies?: string[];
}
export declare function extractContract(rawIntent: string, inspection?: ContractInspection): TaskContract;
export interface Ambiguity {
    costly: boolean;
    question?: string;
    alternatives: string[];
}
export declare function detectAmbiguity(contract: TaskContract): Ambiguity;
