import { LocalExecutionEnvironment } from "../execution/local.js";
import { conditionOutput } from "../output/conditioner.js";
import { storeOutput } from "../output/store.js";
export async function runVerification(cwd, plan, environment = new LocalExecutionEnvironment(cwd), runId = "verification") {
    const results = [];
    for (const check of plan.checks) {
        const result = await environment.run(check.command, check.args, { timeoutMs: check.timeoutMs ?? 120_000 });
        const status = result.timedOut ? "timeout" : result.exitCode === 0 ? "pass" : result.exitCode === null ? "unavailable" : "fail";
        const conditioned = conditionOutput(result), proof = await storeOutput(cwd, result, runId);
        results.push({ ...result, id: check.id, reason: check.reason, status, summary: conditioned.summary, proof, conditionedBytes: conditioned.retainedBytes, tokensRemoved: conditioned.tokensRemoved, actionableFailures: conditioned.actionableFailures, outputTruncated: conditioned.truncated });
        if (status === "fail" || status === "timeout")
            break;
    }
    return results;
}
