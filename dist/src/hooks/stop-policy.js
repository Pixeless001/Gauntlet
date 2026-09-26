/** Block only for a real, new failure: never in plan mode, on a hook-driven continuation, or when the identical
 *  failure was already reported and nothing changed since (each turn restarts the task, so that would loop). */
export function shouldBlockStop(facts) {
    if (facts.planMode || facts.stopHookActive || facts.files === 0 || facts.completion === "complete")
        return false;
    if (!facts.failedChecks.length && !facts.blockingCodes.length)
        return false;
    return facts.fingerprint !== facts.lastBlocked;
}
