import type { Finding } from "../core/events.js";
import type { TestSignature } from "../core/task-state.js";
import type { FileDelta } from "../core/task-state.js";
import { captureTestSignatures } from "../repo/tests.js";

export async function inspectTestIntegrity(cwd: string, before: Record<string, TestSignature>, changes?: FileDelta[]): Promise<Finding[]> {
  const changed = changes?.map((item) => item.path).filter((path) => path in before), after = await captureTestSignatures(cwd, changed);
  const findings: Finding[] = [];
  for (const [path, signature] of Object.entries(before)) {
    if (changes && !changed?.includes(path)) continue;
    if (!after[path]) { findings.push({ code: "test-deleted", severity: "error", blocking: true, message: "A test file was deleted during the task.", evidence: [path] }); continue; }
    const missing = signature.assertions.filter((assertion) => !after[path]!.assertions.includes(assertion));
    if (missing.length) findings.push({ code: "assertion-changed", severity: "warning", blocking: true, message: "Existing test assertions changed; confirm the change does not weaken behavioral evidence.", evidence: [path, ...missing.slice(0, 3)] });
    if (after[path]!.skipped > signature.skipped) findings.push({ code: "tests-skipped", severity: "error", blocking: true, message: "The number of skipped tests increased.", evidence: [path, `${signature.skipped} → ${after[path]!.skipped}`] });
  }
  return findings;
}
