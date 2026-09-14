import type { VerificationPlan, VerificationResult } from "./types.js";
import { LocalExecutionEnvironment } from "../execution/local.js";
import type { ExecutionEnvironment } from "../execution/types.js";

export async function runVerification(cwd: string, plan: VerificationPlan, environment: ExecutionEnvironment = new LocalExecutionEnvironment(cwd)): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const check of plan.checks) {
    const result = await environment.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 });
    const status = result.timedOut ? "timeout" : result.exitCode === 0 ? "pass" : result.exitCode === null ? "unavailable" : "fail";
    results.push({ ...result, id: check.id, reason: check.reason, status });
    if (status === "fail" || status === "timeout") break;
  }
  return results;
}
