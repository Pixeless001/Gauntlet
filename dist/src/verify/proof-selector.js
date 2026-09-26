export const proofRequirements = {
    intent: [["contract"]], location: [["search"], ["graph"]], cause: [["reproduction"], ["test"]], repoFit: [["repository_rule"], ["graph"]], api: [["installed_api"]], behavior: [["test"]], regression: [["graph", "test"]], scope: [["diff"]], visual: [["browser"]], performance: [["measurement"]],
};
export const proofMap = Object.fromEntries(Object.entries(proofRequirements).map(([kind, alternatives]) => [kind, [...new Set(alternatives.flat())]]));
export function hasSufficientProof(kind, supplied) {
    const available = supplied instanceof Set ? supplied : new Set(supplied);
    return proofRequirements[kind].some((requirement) => requirement.every((proof) => available.has(proof)));
}
export function remainingProof(uncertainty, supplied, obtainable) {
    const available = new Set(supplied), paths = obtainable ? new Set([...supplied, ...obtainable]) : null, result = [];
    for (const [kind, state] of Object.entries(uncertainty)) {
        if (state !== "open" && state !== "partial")
            continue;
        if (hasSufficientProof(kind, available))
            continue;
        if (paths && !proofRequirements[kind].some((requirement) => requirement.every((proof) => paths.has(proof))))
            continue;
        const closest = proofRequirements[kind].map((requirement) => requirement.filter((proof) => !available.has(proof))).sort((a, b) => a.length - b.length)[0];
        result.push({ uncertainty: kind, proof: closest[0] });
    }
    return result;
}
/** Proof the stop check can really produce. `graph` is built by the engine itself, so it is never
 *  something the agent can be asked to provide when the engine did not build it. */
export function obtainableProof(input) {
    return ["diff", "repository_rule", ...(input.hasIndex ? ["search"] : []), ...(input.hasStructural ? ["graph"] : []), ...(input.hasTestCheck ? ["test"] : []), ...(input.extra ?? [])];
}
