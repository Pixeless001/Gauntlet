export interface StopFacts {
  completion: string | undefined; files: number; blockingCodes: string[]; failedChecks: string[];
  planMode: boolean; stopHookActive: boolean; fingerprint: string; lastBlocked: string | undefined;
}

/** Block only for a real, new failure: never in plan mode, on a hook-driven continuation, or when the identical
 *  failure was already reported and nothing changed since (each turn restarts the task, so that would loop). */
export function shouldBlockStop(facts: StopFacts): boolean {
  if (facts.planMode || facts.stopHookActive || facts.files === 0 || facts.completion === "complete") return false;
  if (!facts.failedChecks.length && !facts.blockingCodes.length) return false;
  return facts.fingerprint !== facts.lastBlocked;
}
