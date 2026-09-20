import type { UncertaintyKind, UncertaintyState } from "../control/uncertainty.js";
import { rejectedOverlap, type ExecutionCheckpoint } from "./checkpoints.js";
import type { ExecutionEvent } from "./events.js";

export type ProgressStatus = "PROGRESS" | "STALLED" | "REGRESSED";
export interface ProgressDelta {
  status: ProgressStatus;
  reason: string;
  unresolved: UncertaintyKind[];
  proofGained: boolean;
}
export interface ProgressInput { events: ExecutionEvent[]; checkpoints: ExecutionCheckpoint[]; activeCheckpointId: string; uncertainty: UncertaintyState }

/** Classify observable task movement without treating code volume or tool count as progress. */
export function assessProgress(input: ProgressInput): ProgressDelta {
  const unresolved = (Object.entries(input.uncertainty) as [UncertaintyKind, UncertaintyState[UncertaintyKind]][]).filter(([, state]) => state === "open" || state === "partial").map(([kind]) => kind);
  const recent = input.events.at(-1), proofGained = Boolean(recent?.proofRef) || recent?.type === "test_result" && recent.outcome === "pass" || recent?.type === "decision_signal" && recent.outcome === "pass";
  if (recent?.target) {
    const overlap = rejectedOverlap(input.checkpoints, recent.target);
    if (overlap) return { status: "REGRESSED", reason: `Activity overlaps rejected direction ${overlap.id}`, unresolved, proofGained };
  }
  const sameFailures = recent?.type === "failure" && recent.target ? input.events.filter((event) => event.type === "failure" && event.target === recent.target).length : 0;
  const sameWrites = recent?.type === "file_write" && recent.target ? input.events.filter((event) => event.type === "file_write" && event.target === recent.target).length : 0;
  if (!proofGained && (sameFailures >= 2 || sameWrites >= 3)) return { status: "STALLED", reason: sameFailures >= 2 ? "Repeated failure did not add proof" : "Repeated rewrite did not resolve uncertainty", unresolved, proofGained };
  return { status: "PROGRESS", reason: proofGained ? "New validation proof was recorded" : "No stalled or regressed state observed", unresolved, proofGained };
}
