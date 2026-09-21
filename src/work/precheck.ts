import { fingerprint } from "./graph.js";
import type { WorkNode } from "./types.js";

export interface Approach { mechanism: string; target: string; assumptions: string[]; }
export interface FailurePrecheck { permitted: boolean; fingerprint: string; constraint?: string; evidenceRef?: string; }

export function approachFingerprint(approach: Approach): string {
  return fingerprint({ mechanism: approach.mechanism, target: approach.target, assumptions: [...approach.assumptions].sort() });
}

export function precheckFailure(node: WorkNode, approach: Approach): FailurePrecheck {
  const value = approachFingerprint(approach), rejection = node.rejection;
  if (rejection?.approachFingerprint === value) return { permitted: false, fingerprint: value, constraint: rejection.constraint, ...(rejection.evidenceRef ? { evidenceRef: rejection.evidenceRef } : {}) };
  return { permitted: true, fingerprint: value };
}
