export function measure(state, changes, results, now = new Date(), completion, trace = { frontierWaitMs: 0, maxFrontier: 0, semanticSynthesis: 0, workerCandidates: 0 }) {
    const verified = results.length > 0 && results.every((result) => result.status === "pass");
    const clean = state.findings.every((finding) => !(finding.blocking ?? finding.severity !== "info"));
    const complete = clean && verified && completion?.status === "complete";
    const proof = results.map((result) => ({ id: result.id, status: result.status, ...(result.summary ? { summary: result.summary } : {}), ...(result.proof ? { reference: result.proof } : {}) }));
    const traces = state.control?.traces ?? [], execution = state.control?.execution;
    const activationLevels = traces.flatMap((trace) => trace.activations?.map((item) => item.level) ?? []);
    const output = { rawBytes: results.reduce((sum, result) => sum + Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 0), visibleBytes: results.reduce((sum, result) => sum + (result.conditionedBytes ?? Buffer.byteLength(result.summary ?? "")), 0), tokensRemoved: results.reduce((sum, result) => sum + (result.tokensRemoved ?? 0), 0), actionableFailures: results.reduce((sum, result) => sum + (result.actionableFailures ?? 0), 0), proofReferences: results.filter((result) => Boolean(result.proof)).length, truncated: results.filter((result) => result.outputTruncated).length };
    const completionStatus = complete ? "complete" : completion?.status ?? "incomplete";
    const nodes = Object.values(state.world.work.nodes), evidence = nodes.flatMap((node) => node.evidenceRefs), totalNodeAttempts = nodes.reduce((total, node) => total + node.attempt, 0), orchestration = { nodes: nodes.length, requiredNodes: nodes.filter((node) => node.required).length, validatedNodes: nodes.filter((node) => node.state === "VALIDATED").length, staleNodes: nodes.filter((node) => node.state === "STALE").length, collapsedNodes: nodes.filter((node) => node.state === "COLLAPSED").length, criticalPath: Math.max(0, ...nodes.filter((node) => node.required).map((node) => node.criticalPath)), decisionRevision: state.world.decision.revision, eventSequence: state.world.appliedEvent, totalNodeAttempts, duplicateEvidence: evidence.length - new Set(evidence).size, frontierWaitMs: trace.frontierWaitMs, maxFrontier: trace.maxFrontier, fanOutBenefit: Math.max(0, trace.maxFrontier - 1), workerCandidates: trace.workerCandidates, semanticSynthesis: trace.semanticSynthesis, verifierYield: nodes.filter((node) => node.kind === "verification" && ["VALIDATED", "COLLAPSED"].includes(node.state)).length, redoRate: totalNodeAttempts ? (totalNodeAttempts - nodes.length) / totalNodeAttempts : 0, writeConflicts: nodes.filter((node) => node.rejection?.constraint.includes("write ownership")).length };
    return { version: 1, taskId: state.id, startedAt: state.startedAt, finishedAt: now.toISOString(), durationMs: Math.max(0, now.getTime() - new Date(state.startedAt).getTime()), attempts: state.attempts, files: changes.length, added: changes.reduce((n, f) => n + f.added, 0), removed: changes.reduce((n, f) => n + f.removed, 0), testsPassed: results.filter((r) => r.id.includes("test") && r.status === "pass").length, checksRun: results.length, clean, verified, firstPass: complete && state.attempts <= 1, completion: completionStatus, directive: { action: complete ? "complete" : "incomplete", reason: complete ? "Acceptance and preservation checks passed" : completion?.reasons.join("; ") || "Completion requirements remain unresolved" }, findings: state.findings.map((finding) => `${finding.code}: ${finding.message}${finding.proof.length ? ` (${finding.proof.join(", ")})` : ""}`), proof, conventions: state.conventionMetrics, output, outcome: { complete, missingInvariants: completion?.missingInvariants ?? completion?.reasons ?? [], proofReferences: completion?.proofRefs?.length ?? proof.length }, orchestration, ...(state.control ? { context: { repeatReadsDetected: state.control.repeatReadsDetected, repeatSearchesDetected: state.control.repeatSearchesDetected ?? 0, compactions: state.control.compactions, skillInvocations: state.control.activeSkills.length }, selection: { interventions: state.control.interventionsUsed ?? 0, traces: traces.length, averageDepth: activationLevels.length ? activationLevels.reduce((sum, level) => sum + level, 0) / activationLevels.length : 0, graphExpansions: state.control.graphExpansions ?? 0, externalDocCalls: state.control.externalDocCalls ?? 0, browserActivations: state.control.browserActivations ?? 0, delegations: state.control.delegations ?? 0 }, memory: { rawEvents: execution?.events.length ?? 0, checkpoints: execution?.checkpoints.length ?? 0, activePath: execution ? pathLength(execution.checkpoints, execution.activeCheckpointId) : 0, rejectedBranches: execution?.checkpoints.filter((item) => item.status === "rejected").length ?? 0 } } : {}) };
}
export function frontierWait(events) {
    const ready = new Map();
    let total = 0;
    for (const event of events) {
        if (!event.nodeId)
            continue;
        if (event.type === "NODE_READY")
            ready.set(event.nodeId, Date.parse(event.at));
        if (event.type === "NODE_STARTED") {
            const at = ready.get(event.nodeId);
            if (at !== undefined)
                total += Math.max(0, Date.parse(event.at) - at);
            ready.delete(event.nodeId);
        }
    }
    return total;
}
function pathLength(checkpoints, activeId) { const byId = new Map(checkpoints.map((item) => [item.id, item])); let count = 0, current = byId.get(activeId), seen = new Set(); while (current && !seen.has(current.id)) {
    seen.add(current.id);
    count += 1;
    current = current.parentId ? byId.get(current.parentId) : undefined;
} return count; }
