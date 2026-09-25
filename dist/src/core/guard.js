import { detectDependencies } from "../repo/detect.js";
export async function evaluateGuards(cwd, state, changes) {
    const findings = [];
    const grown = changes.filter((file) => file.added > 0), total = grown.reduce((sum, file) => sum + file.added, 0);
    if (grown.length > 8 && total > 300)
        findings.push({ code: "scope-growth", severity: "warning", blocking: false, message: "The implementation footprint is unusually large; confirm every changed file is task-scoped.", proof: [`${grown.length} files`, `${total} added lines`] });
    const dependencies = await detectDependencies(cwd);
    const added = dependencies.filter((item) => !state.baseline.dependencies.includes(item));
    if (added.length)
        findings.push({ code: "dependency-added", severity: "warning", blocking: false, message: "New runtime dependencies require justification.", proof: added });
    const repeated = loopFinding(state);
    if (repeated)
        findings.push(repeated);
    return findings;
}
export function loopFinding(state) {
    const failures = state.activities.filter((item) => item.outcome === "fail" && item.target).map((item) => item.target);
    const target = failures.find((item) => failures.filter((other) => other === item).length >= 3);
    return target ? { code: "repair-loop", severity: "warning", blocking: true, message: "The same failure occurred at least three times; reassess the underlying assumption.", proof: [target] } : null;
}
export function dependencyDelta(before, after) { return after.filter((item) => !before.dependencies.includes(item)); }
