import { run } from "../repo/process.js";
import type { VerificationPlan, VerificationResult } from "./types.js";

export async function runVerification(cwd: string, plan: VerificationPlan): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const check of plan.checks) {
    const result = await run(check.command, check.args, cwd, check.timeoutMs ?? 120_000);
    const status = result.timedOut ? "timeout" : result.exitCode === 0 ? "pass" : result.exitCode === null ? "unavailable" : "fail";
    results.push({ ...result, id: check.id, reason: check.reason, status });
    if (status === "fail" || status === "timeout") break;
  }
  return results;
}
