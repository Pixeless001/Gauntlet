import { createControlState } from "../core/task-state.js";
import { extractContract } from "../core/intent.js";
const legacyKeyMap = {
    evidence: "proof",
    evidenceRef: "proofRef",
    evidenceRefs: "proofRefs",
    evidenceFound: "proofFound",
    evidenceReferences: "proofReferences",
    supportingEvidence: "supportingProof",
    contradictingEvidence: "contradictingProof",
    sufficientEvidence: "sufficientProof",
    candidateEvidenceAvailable: "candidateProofAvailable",
    sources: "sourceRefs",
};
export const LEGACY_KEYS = Object.freeze(Object.keys(legacyKeyMap));
export const MIGRATION_MODULE = "src/state/v1-migration.ts";
export function migrateLegacyKeys(value) {
    if (Array.isArray(value))
        return value.map(migrateLegacyKeys);
    if (!value || typeof value !== "object")
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [legacyKeyMap[key] ?? key, migrateLegacyKeys(item)]));
}
export function migrateTaskV1(input) {
    if (!input || typeof input !== "object")
        return input;
    const original = input;
    if (original.version !== 1)
        return original;
    const migrated = migrateLegacyKeys(input);
    const value = migrated;
    const oldContract = value.contract && typeof value.contract === "object" ? value.contract : {};
    const intent = typeof oldContract.intent === "string" ? oldContract.intent : "";
    const contract = { ...extractContract(intent), ...oldContract, intent };
    const previous = value.control && typeof value.control === "object" ? value.control : value.session && typeof value.session === "object" ? value.session : {};
    const defaults = createControlState(contract);
    const traces = Array.isArray(previous.selectionTraces) ? previous.selectionTraces : previous.traces;
    const oldDecisions = previous.decisions;
    const validatedDecisions = Array.isArray(oldDecisions) ? oldDecisions.filter((item) => typeof item === "string") : [];
    const control = {
        ...defaults,
        ...previous,
        impact: { ...defaults.impact, ...previous.impact },
        progress: { ...defaults.progress, ...previous.progress },
        context: { ...defaults.context, ...previous.context },
        scope: { ...defaults.scope, ...previous.scope },
        lifecycle: { ...defaults.lifecycle, ...previous.lifecycle },
        hysteresis: { ...defaults.hysteresis, ...previous.hysteresis },
        traces: Array.isArray(traces) ? traces : [],
        decisions: defaults.decisions,
        validatedDecisions,
        execution: previous.execution ? { ...defaults.execution, ...previous.execution, events: previous.execution.events ?? [], nextEvent: previous.execution.nextEvent ?? 0 } : defaults.execution,
    };
    const { session: _discarded, ...rest } = value;
    return { ...rest, version: 2, contract, clarifications: Array.isArray(value.clarifications) ? value.clarifications : [], control };
}
