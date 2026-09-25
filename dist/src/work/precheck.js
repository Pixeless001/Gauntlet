import { fingerprint } from "./graph.js";
export function approachFingerprint(approach) {
    return fingerprint({ mechanism: approach.mechanism, target: approach.target, assumptions: [...approach.assumptions].sort() });
}
export function precheckFailure(node, approach) {
    const value = approachFingerprint(approach), rejection = node.rejection;
    if (rejection?.approachFingerprint === value)
        return { permitted: false, fingerprint: value, constraint: rejection.constraint, ...(rejection.evidenceRef ? { evidenceRef: rejection.evidenceRef } : {}) };
    return { permitted: true, fingerprint: value };
}
