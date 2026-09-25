export async function verifyCounterfactual(check, before, after, enabled) {
    if (!enabled || !before)
        return { status: "skipped", beforeExit: null, afterExit: null, proof: [!enabled ? "not selected by task risk" : "safe pre-change execution unavailable"] };
    const oldResult = await before.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 }), newResult = await after.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 });
    const status = oldResult.exitCode !== 0 && newResult.exitCode === 0 ? "strong" : oldResult.exitCode === 0 && newResult.exitCode === 0 ? "weak" : "inconclusive";
    return { status, beforeExit: oldResult.exitCode, afterExit: newResult.exitCode, proof: [`pre-change exit: ${oldResult.exitCode ?? "unavailable"}`, `candidate exit: ${newResult.exitCode ?? "unavailable"}`] };
}
