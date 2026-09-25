import { eligibleForPromotion } from "../measure/evals.js";
import { PatternStore } from "./patterns.js";
import { runEvalSuite } from "../measure/eval-runner.js";
import { compareEval } from "../measure/evals.js";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
/** Produce at most one atomic proposal from supported knowledge. Runtime tasks never call this function. */
export function proposeAtomicChange(patterns) {
    const candidate = patterns.filter((item) => item.status === "supported" && item.supportingProof.length > item.contradictingProof.length).sort((a, b) => b.supportingProof.length - a.supportingProof.length || a.id.localeCompare(b.id))[0];
    return candidate ? { id: `proposal:${candidate.id}`, kind: candidate.kind, patternId: candidate.id, summary: candidate.summary, evaluationCases: [...candidate.taskClasses] } : null;
}
export function evaluateProposal(pattern, proposal, results) {
    if (proposal.patternId !== pattern.id)
        throw new Error("Proposal does not match its proof pattern");
    const retainBehavior = eligibleForPromotion(results), now = new Date().toISOString();
    return { retainBehavior, reason: retainBehavior ? "Evaluation improved without regressions" : "Evaluation did not earn behavior promotion", pattern: { ...pattern, status: retainBehavior ? "promoted" : "supported", updatedAt: now } };
}
export async function runEvolution(cwd, dryRun = false) {
    const store = new PatternStore(cwd), patterns = await store.list(), proposal = proposeAtomicChange(patterns);
    if (!proposal)
        return { status: "no-proposal" };
    const pattern = patterns.find((item) => item.id === proposal.patternId);
    const representative = await runEvalSuite("decisions"), comparisons = representative.map((item) => compareEval(item, item)), decision = evaluateProposal(pattern, proposal, comparisons);
    if (dryRun)
        return { status: "dry-run", proposal };
    const directory = join(cwd, ".gauntlet", "evolution"), name = `${new Date().toISOString().replaceAll(":", "-")}-${proposal.patternId}.json`, path = join(directory, name), temporary = `${path}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporary, JSON.stringify({ version: 1, proposal, decision, cases: comparisons.map((item) => ({ caseId: item.caseId, improved: item.cleanFirstPassImproved, overheadMs: item.overheadMs })) }, null, 2), { mode: 0o600 });
    await rename(temporary, path);
    if (decision.retainBehavior)
        await store.put(decision.pattern);
    return { status: decision.retainBehavior ? "promoted" : "rejected", proposal, path };
}
