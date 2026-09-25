export function assessRisk(contract, changes = []) {
    const text = `${contract.intent} ${contract.explicitPaths.join(" ")} ${changes.map((item) => item.path).join(" ")}`.toLowerCase();
    const reasons = [
        /auth|permission|credential|security/.test(text) && "security boundary",
        /migration|schema|database|transaction/.test(text) && "data boundary",
        /concurr|race|lock|atomic/.test(text) && "concurrency",
        /public api|exports?\b/.test(text) && "public surface",
        /performance|latency|memory|profil/.test(text) && "performance objective",
        changes.some((item) => /(?:package\.json|pyproject\.toml|cargo\.toml|go\.mod)$/i.test(item.path)) && "dependency or build configuration",
    ].filter((item) => Boolean(item));
    if (reasons.length)
        return { level: "elevated", reasons };
    const documentation = changes.length > 0 && changes.every((item) => /(?:\.md|\.txt|\.rst)$/i.test(item.path));
    return documentation || /\b(?:readme|documentation|typo)\b/i.test(contract.intent) ? { level: "minimal", reasons: ["documentation-only"] } : { level: "ordinary", reasons: [] };
}
