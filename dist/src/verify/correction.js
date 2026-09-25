export function correctionPacket(findings, scope) {
    const finding = findings.find((item) => item.blocking);
    if (!finding)
        return null;
    return { finding: finding.message, uncertainty: uncertaintyFor(finding.code), scope: [...new Set([...finding.proof.filter((item) => /[/.]/.test(item)).map((item) => item.split(":")[0]), ...scope])].slice(0, 8), proof: finding.proof.slice(0, 4), ...(finding.proof[0] ? { nextCheck: `Re-run the check supporting ${finding.proof[0]}` } : {}) };
}
function uncertaintyFor(code) {
    if (code === "weak-counterfactual" || code.includes("test"))
        return "behavior";
    if (code.includes("architecture") || code.includes("convention") || code.includes("dependency"))
        return "repoFit";
    if (code.includes("scope"))
        return "scope";
    return "regression";
}
