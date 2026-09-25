import { activePath, rejectedOverlap } from "./checkpoints.js";
export function reconstruct(state) {
    const execution = state.control?.execution;
    if (!execution)
        return { task: state.contract.intent, acceptanceCriteria: state.contract.acceptanceCriteria, constraints: state.contract.constraints, validatedState: [], current: state.control?.currentApproach ?? "", relevantFiles: state.workingSet, relevantSymbols: [], proofRefs: [], open: state.control?.unresolvedIssues ?? [] };
    const path = activePath(execution.checkpoints, execution.activeCheckpointId);
    const recent = [...execution.events].reverse().find((event) => event.target)?.target;
    const rejected = recent ? rejectedOverlap(execution.checkpoints, recent) : null;
    return {
        task: state.contract.intent, acceptanceCriteria: [...state.contract.acceptanceCriteria], constraints: [...new Set([...state.contract.constraints, ...path.flatMap((item) => item.constraints)])],
        validatedState: path.filter((item) => item.status === "validated").map((item) => item.summary), current: path.at(-1)?.summary ?? "",
        relevantFiles: [...new Set(path.flatMap((item) => item.relevantFiles))], relevantSymbols: [...new Set(path.flatMap((item) => item.relevantSymbols))],
        proofRefs: [...new Set(path.flatMap((item) => item.proofRefs))], open: Object.entries(state.control?.uncertainty ?? {}).filter(([, value]) => value === "open" || value === "partial").map(([key]) => key),
        ...(rejected ? { rejectedWarning: `Current work overlaps rejected direction "${rejected.summary}": ${rejected.rejectionReason}` } : {}),
    };
}
