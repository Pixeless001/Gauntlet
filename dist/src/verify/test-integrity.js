import { captureTestSignatures } from "../repo/tests.js";
export async function inspectTestIntegrity(cwd, before, changes) {
    const changed = changes?.map((item) => item.path).filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path)), after = await captureTestSignatures(cwd, changed);
    const findings = [];
    for (const [path, signature] of Object.entries(before)) {
        if (changes && !changed?.includes(path))
            continue;
        if (!after[path]) {
            findings.push({ code: "test-deleted", severity: "error", blocking: true, message: "A test file was deleted during the task.", proof: [path] });
            continue;
        }
        const missing = signature.assertions.filter((assertion) => !after[path].assertions.includes(assertion));
        const added = after[path].assertions.filter((assertion) => !signature.assertions.includes(assertion)), weakening = missing.length > 0 && (added.length === 0 || added.some(isBroadAssertion));
        if (missing.length)
            findings.push({ code: weakening ? "assertion-weakened" : "assertion-changed", severity: "warning", blocking: weakening, message: weakening ? "An existing assertion was removed or replaced by broader proof." : "Existing assertions changed; review the task-scoped behavioral update.", proof: [path, ...missing.slice(0, 3)] });
        if (after[path].skipped > signature.skipped)
            findings.push({ code: "tests-skipped", severity: "error", blocking: true, message: "The number of skipped tests increased.", proof: [path, `${signature.skipped} → ${after[path].skipped}`] });
    }
    for (const path of changed ?? [])
        if (!(path in before) && after[path]?.skipped)
            findings.push({ code: "tests-skipped", severity: "error", blocking: true, message: "A new test was committed skipped or pending.", proof: [path, `0 → ${after[path].skipped}`] });
    return findings;
}
function isBroadAssertion(assertion) { return /(?:toBeTruthy|toBeDefined|toBeGreaterThan|toBeLessThan|toMatchObject|expect\.any|\.ok\s*\()/.test(assertion); }
