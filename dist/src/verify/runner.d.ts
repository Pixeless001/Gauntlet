import type { VerificationPlan, VerificationResult } from "./types.js";
import type { ExecutionEnvironment } from "../execution/types.js";
export declare function runVerification(cwd: string, plan: VerificationPlan, environment?: ExecutionEnvironment, runId?: string): Promise<VerificationResult[]>;
