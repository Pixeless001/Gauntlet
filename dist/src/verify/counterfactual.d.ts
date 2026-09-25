import type { ExecutionEnvironment } from "../execution/types.js";
import type { VerificationCheck } from "./types.js";
export type CounterfactualStatus = "strong" | "weak" | "inconclusive" | "skipped";
export interface CounterfactualResult {
    status: CounterfactualStatus;
    beforeExit: number | null;
    afterExit: number | null;
    proof: string[];
}
export interface CounterfactualEnvironment extends ExecutionEnvironment {
    candidateProofAvailable: true;
}
export declare function verifyCounterfactual(check: VerificationCheck, before: CounterfactualEnvironment | null, after: ExecutionEnvironment, enabled: boolean): Promise<CounterfactualResult>;
