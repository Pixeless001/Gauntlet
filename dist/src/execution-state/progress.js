import { rejectedOverlap } from "./checkpoints.js";
/** Classify observable task movement without treating code volume or tool count as progress. */
export function assessProgress(input) {
    const unresolved = Object.entries(input.uncertainty).filter(([, state]) => state === "open" || state === "partial").map(([kind]) => kind);
    const recent = input.events.at(-1), proofGained = Boolean(recent?.proofRef) || recent?.type === "test_result" && recent.outcome === "pass" || recent?.type === "decision_signal" && recent.outcome === "pass";
    const failureSignature = recent?.type === "failure" ? `${recent.target ?? "unknown"}:${recent.outcome ?? "fail"}` : undefined;
    const priorFailure = [...input.events.slice(0, -1)].reverse().find((event) => event.type === "failure");
    const repeatedTargets = [...new Set(input.events.flatMap((event) => event.target && input.events.filter((item) => item.target === event.target).length > 1 ? [event.target] : []))];
    const common = { unresolved, proofGained, uncertaintyDelta: (input.previousUnresolved?.length ?? unresolved.length) - unresolved.length, proofDelta: proofGained ? 1 : 0, ...(failureSignature ? { failureSignature } : {}), changedFailure: Boolean(failureSignature && priorFailure?.target && priorFailure.target !== recent?.target), repeatedTargets, diffGrowth: input.diffGrowth ?? 0 };
    if (recent?.target) {
        const overlap = rejectedOverlap(input.checkpoints, recent.target);
        if (overlap)
            return { status: "REGRESSED", reason: `Activity overlaps rejected direction ${overlap.id}`, ...common, rejectedOverlap: true };
    }
    const sameFailures = recent?.type === "failure" && recent.target ? input.events.filter((event) => event.type === "failure" && event.target === recent.target).length : 0;
    const sameWrites = recent?.type === "file_write" && recent.target ? input.events.filter((event) => event.type === "file_write" && event.target === recent.target).length : 0;
    if (!proofGained && (sameFailures >= 2 || sameWrites >= 3))
        return { status: "STALLED", reason: sameFailures >= 2 ? "Repeated failure did not add proof" : "Repeated rewrite did not resolve uncertainty", ...common, rejectedOverlap: false };
    return { status: "PROGRESS", reason: proofGained || common.uncertaintyDelta > 0 ? "New task support was recorded" : "No stalled or regressed state observed", ...common, rejectedOverlap: false };
}
