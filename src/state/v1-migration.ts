import { createControlState, type ControlState } from "../core/task-state.js";
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
} as const;

export const LEGACY_KEYS = Object.freeze(Object.keys(legacyKeyMap));
export const MIGRATION_MODULE = "src/state/v1-migration.ts";

export function migrateLegacyKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(migrateLegacyKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [legacyKeyMap[key as keyof typeof legacyKeyMap] ?? key, migrateLegacyKeys(item)]));
}

export function migrateTaskV1(input: unknown): unknown {
  const migrated = migrateLegacyKeys(input);
  if (!migrated || typeof migrated !== "object") return migrated;
  const value = migrated as Record<string, unknown>;
  if (value.version !== 1) return value;
  const oldContract = value.contract && typeof value.contract === "object" ? value.contract as Record<string, unknown> : {};
  const intent = typeof oldContract.intent === "string" ? oldContract.intent : "";
  const contract = { ...extractContract(intent), ...oldContract, intent };
  const previous = value.control && typeof value.control === "object" ? value.control as Partial<ControlState> : value.session && typeof value.session === "object" ? value.session as Partial<ControlState> : {};
  const defaults = createControlState(contract);
  const traces = Array.isArray((previous as Record<string, unknown>).selectionTraces) ? (previous as Record<string, unknown>).selectionTraces : previous.traces;
  const oldDecisions = (previous as Record<string, unknown>).decisions;
  const validatedDecisions = Array.isArray(oldDecisions) ? oldDecisions.filter((item): item is string => typeof item === "string") : [];
  const control: ControlState = {
    ...defaults,
    ...previous,
    impact: { ...defaults.impact, ...previous.impact },
    progress: { ...defaults.progress, ...previous.progress },
    context: { ...defaults.context, ...previous.context },
    scope: { ...defaults.scope, ...previous.scope },
    lifecycle: { ...defaults.lifecycle, ...previous.lifecycle },
    hysteresis: { ...defaults.hysteresis, ...previous.hysteresis },
    traces: Array.isArray(traces) ? traces as ControlState["traces"] : [],
    decisions: defaults.decisions,
    validatedDecisions,
    execution: previous.execution ? { ...defaults.execution, ...previous.execution, events: previous.execution.events ?? [], nextEvent: previous.execution.nextEvent ?? 0 } : defaults.execution,
  };
  const { session: _discarded, ...rest } = value;
  return { ...rest, version: 2, contract, clarifications: Array.isArray(value.clarifications) ? value.clarifications : [], control };
}
