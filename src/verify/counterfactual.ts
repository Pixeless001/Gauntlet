import type { ExecutionEnvironment } from "../execution/types.js";
import type { VerificationCheck } from "./types.js";

export type CounterfactualStatus = "strong" | "weak" | "inconclusive" | "skipped";
export interface CounterfactualResult { status: CounterfactualStatus; beforeExit: number | null; afterExit: number | null; proof: string[] }
export interface CounterfactualEnvironment extends ExecutionEnvironment { candidateProofAvailable: true }

export async function verifyCounterfactual(check: VerificationCheck, before: CounterfactualEnvironment | null, after: ExecutionEnvironment, enabled: boolean): Promise<CounterfactualResult> {
  if (!enabled || !before) return { status: "skipped", beforeExit: null, afterExit: null, proof: [!enabled ? "not selected by task risk" : "safe pre-change execution unavailable"] };
  const oldResult = await before.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 }), newResult = await after.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 });
  const status = oldResult.exitCode !== 0 && newResult.exitCode === 0 ? "strong" : oldResult.exitCode === 0 && newResult.exitCode === 0 ? "weak" : "inconclusive";
  return { status, beforeExit: oldResult.exitCode, afterExit: newResult.exitCode, proof: [`pre-change exit: ${oldResult.exitCode ?? "unavailable"}`, `candidate exit: ${newResult.exitCode ?? "unavailable"}`] };
}
