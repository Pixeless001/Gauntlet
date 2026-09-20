import { activePath, rejectedOverlap } from "./checkpoints.js";
import type { TaskState } from "../core/task-state.js";

export interface ActiveExecutionContext { task: string; acceptanceCriteria: string[]; constraints: string[]; validatedState: string[]; current: string; relevantFiles: string[]; relevantSymbols: string[]; proofRefs: string[]; open: string[]; rejectedWarning?: string }

export function reconstruct(state: TaskState): ActiveExecutionContext {
  const execution = state.session?.execution;
  if (!execution) return { task: state.contract.intent, acceptanceCriteria: state.contract.acceptanceCriteria, constraints: state.contract.constraints, validatedState: [], current: state.session?.currentApproach ?? "", relevantFiles: state.workingSet, relevantSymbols: [], proofRefs: [], open: state.session?.unresolvedIssues ?? [] };
  const path = activePath(execution.checkpoints, execution.activeCheckpointId);
  const recent = [...execution.events].reverse().find((event) => event.target)?.target;
  const rejected = recent ? rejectedOverlap(execution.checkpoints, recent) : null;
  return {
    task: state.contract.intent, acceptanceCriteria: [...state.contract.acceptanceCriteria], constraints: [...new Set([...state.contract.constraints, ...path.flatMap((item) => item.constraints)])],
    validatedState: path.filter((item) => item.status === "validated").map((item) => item.summary), current: path.at(-1)?.summary ?? "",
    relevantFiles: [...new Set(path.flatMap((item) => item.relevantFiles))], relevantSymbols: [...new Set(path.flatMap((item) => item.relevantSymbols))],
    proofRefs: [...new Set(path.flatMap((item) => item.proofRefs))], open: Object.entries(state.session?.uncertainty ?? {}).filter(([, value]) => value === "open" || value === "partial").map(([key]) => key),
    ...(rejected ? { rejectedWarning: `Current work overlaps rejected direction "${rejected.summary}": ${rejected.rejectionReason}` } : {}),
  };
}
