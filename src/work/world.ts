import type { TaskContract } from "../core/events.js";
import { createCommunicationGraph, createGraph, createValidityGraph, fingerprint, invalidateCone, invalidateDecision } from "./graph.js";
import type { CurrentValidWorld, WorldFingerprint, WorldFingerprintInputs } from "./types.js";

type PartialWorldFingerprintInputs = Omit<WorldFingerprintInputs, "config" | "upstream"> & Partial<Pick<WorldFingerprintInputs, "config" | "upstream">>;
const normalizeInputs = (inputs: PartialWorldFingerprintInputs): WorldFingerprintInputs => ({ ...inputs, config: inputs.config ?? {}, upstream: inputs.upstream ?? {} });

export function createWorld(contract: TaskContract, canonicalRevision: string | null, inputs: PartialWorldFingerprintInputs): CurrentValidWorld {
  const normalized = normalizeInputs(inputs), fingerprintValue = fingerprint(normalized);
  return {
    version: 1, revision: 1, contractVersion: 1, contract, expectedScope: [...contract.expectedFrontier], canonicalRevision,
    fingerprint: { ...normalized, value: fingerprintValue }, facts: {}, work: createGraph(), validity: createValidityGraph(), communication: createCommunicationGraph(), uncertainties: [], rules: [], legalActions: ["read", "write", "verify"], capabilities: [], ownership: {}, evidenceRefs: [],
    decision: { revision: 1, fingerprint: fingerprintValue, candidates: [], valid: false }, appliedEvent: 0,
  };
}

export function refreshWorld(world: CurrentValidWorld, inputs: PartialWorldFingerprintInputs, canonicalRevision: string | null): CurrentValidWorld {
  const normalized = normalizeInputs(inputs), value = fingerprint(normalized);
  if (value === world.fingerprint.value && canonicalRevision === world.canonicalRevision) return world;
  return invalidateDecision({ ...world, revision: world.revision + 1, canonicalRevision, fingerprint: { ...normalized, value } });
}

export function refreshValidityInputs(world: CurrentValidWorld, inputs: PartialWorldFingerprintInputs, canonicalRevision: string | null): CurrentValidWorld {
  const normalized = normalizeInputs(inputs), sources = changedSources(world.fingerprint, normalized, world.canonicalRevision, canonicalRevision); let next = world;
  for (const source of sources) next = invalidateCone(next, source).world;
  return refreshWorld(next, normalized, canonicalRevision);
}

export function refreshCapabilities(world: CurrentValidWorld, capabilities: string[]): CurrentValidWorld {
  const next = [...new Set(capabilities)].sort();
  if (JSON.stringify(next) === JSON.stringify(world.capabilities)) return world;
  const { value: _value, ...inputs } = world.fingerprint, runtime = fingerprint({ runtime: inputs.runtime, capabilities: next });
  return { ...refreshValidityInputs(world, { ...inputs, runtime }, world.canonicalRevision), capabilities: next };
}

export function refreshRules(world: CurrentValidWorld, rules: string[]): CurrentValidWorld {
  const next = [...new Set(rules)].sort();
  if (JSON.stringify(next) === JSON.stringify(world.rules)) return world;
  const { value: _value, ...inputs } = world.fingerprint;
  return { ...refreshValidityInputs(world, { ...inputs, rules: fingerprint(next) }, world.canonicalRevision), rules: next };
}

function changedSources(current: WorldFingerprint, next: Omit<WorldFingerprint, "value">, currentRevision: string | null, nextRevision: string | null): string[] {
  const sources: string[] = [];
  if (current.contract !== next.contract) sources.push("contract");
  if (current.rules !== next.rules) sources.push("rules");
  if (current.runtime !== next.runtime) sources.push("runtime");
  if (currentRevision !== nextRevision) sources.push("revision");
  for (const path of new Set([...Object.keys(current.files), ...Object.keys(next.files)])) if (current.files[path] !== next.files[path]) sources.push(`file:${path}`);
  for (const name of new Set([...Object.keys(current.packages), ...Object.keys(next.packages)])) if (current.packages[name] !== next.packages[name]) sources.push(`package:${name}`);
  for (const path of new Set([...Object.keys(current.config), ...Object.keys(next.config)])) if (current.config[path] !== next.config[path]) sources.push(`config:${path}`);
  for (const id of new Set([...Object.keys(current.upstream), ...Object.keys(next.upstream)])) if (current.upstream[id] !== next.upstream[id]) sources.push(`upstream:${id}`);
  return sources;
}
