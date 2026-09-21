import type { TaskContract } from "../core/events.js";
import { createCommunicationGraph, createGraph, createValidityGraph, fingerprint, invalidateDecision } from "./graph.js";
import type { CurrentValidWorld, WorldFingerprint } from "./types.js";

export function createWorld(contract: TaskContract, canonicalRevision: string | null, inputs: Omit<WorldFingerprint, "value">): CurrentValidWorld {
  const fingerprintValue = fingerprint(inputs);
  return {
    version: 1, revision: 1, contractVersion: 1, canonicalRevision,
    fingerprint: { ...inputs, value: fingerprintValue }, facts: {}, work: createGraph(), validity: createValidityGraph(), communication: createCommunicationGraph(), ownership: {}, evidenceRefs: [],
    decision: { revision: 1, fingerprint: fingerprintValue, candidates: [], valid: false }, appliedEvent: 0,
  };
}

export function refreshWorld(world: CurrentValidWorld, inputs: Omit<WorldFingerprint, "value">, canonicalRevision: string | null): CurrentValidWorld {
  const value = fingerprint(inputs);
  if (value === world.fingerprint.value && canonicalRevision === world.canonicalRevision) return world;
  return invalidateDecision({ ...world, revision: world.revision + 1, canonicalRevision, fingerprint: { ...inputs, value } });
}
