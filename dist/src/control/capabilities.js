export function requiredCapabilities(state) {
    const uncertainty = state.control?.uncertainty;
    if (!uncertainty)
        return [];
    const activations = [];
    if (uncertainty.api === "open" && (state.control?.exhaustedEscalation?.api ?? 0) >= 3)
        activations.push({ kind: "docs", uncertainty: "api", reason: "Local package proof was insufficient" });
    if (uncertainty.visual === "open")
        activations.push({ kind: "browser", uncertainty: "visual", reason: "Rendered acceptance remains unverified" });
    const boundedDelegation = state.contract.size !== "systemic" && state.control.scope.expected.length > 1 && state.control.scope.hardSignals.length === 0 && state.control.impact.packageCrossings.length === 0;
    if (boundedDelegation && state.control.interventionsUsed < state.control.budget.interventions && state.attempts > 2 && uncertainty.cause === "open" && (state.control.exhaustedEscalation.cause ?? 0) >= 4)
        activations.push({ kind: "delegation", uncertainty: "cause", reason: "Independent bounded work has measurable parallel value after local paths were exhausted" });
    return activations;
}
export function capabilityCandidates(state, available = {}) {
    return requiredCapabilities(state).map((activation) => ({
        id: `capability:${activation.kind}`, kind: "capability", uncertainty: activation.uncertainty, resolves: [activation.uncertainty],
        level: activation.kind === "delegation" ? 5 : 4, cost: activation.kind === "delegation" ? "high" : "medium",
        authority: activation.kind === "docs" ? "external" : "runtime", source: activation.kind, reason: activation.reason,
        available: available[activation.kind] === true,
    }));
}
