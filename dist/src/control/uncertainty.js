export const uncertaintyKinds = ["intent", "location", "cause", "repoFit", "api", "behavior", "regression", "scope", "visual", "performance"];
export function initialUncertainty(contract, risk) {
    const intent = contract.intent.trim() ? "resolved" : "open";
    const location = contract.explicitPaths.length ? "resolved" : "partial";
    const bug = /\b(?:bug|failure|crash|race|incorrect|broken)\b/i.test(contract.intent);
    const visual = /\b(?:ui|visual|layout|style|responsive|design|modal)\b/i.test(contract.intent);
    const performance = /\b(?:performance|latency|profil|optimi[sz]|throughput)\b/i.test(contract.intent);
    return {
        intent, location, cause: bug ? "open" : "irrelevant", repoFit: risk === "minimal" ? "irrelevant" : "open",
        api: /\b(?:api|sdk|package|library|framework)\b/i.test(contract.intent) ? "open" : "irrelevant",
        behavior: risk === "minimal" ? "irrelevant" : "open", regression: risk === "minimal" ? "irrelevant" : "open",
        scope: "open", visual: visual ? "open" : "irrelevant", performance: performance ? "open" : "irrelevant",
    };
}
export function unresolved(state) {
    return uncertaintyKinds.filter((kind) => state[kind] === "open" || state[kind] === "partial");
}
