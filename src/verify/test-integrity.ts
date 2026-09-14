import type { Finding } from "../core/events.js";
import type { TestSignature } from "../core/task-state.js";
import { captureTestSignatures } from "../repo/tests.js";

export async function inspectTestIntegrity(cwd: string, before: Record<string, TestSignature>): Promise<Finding[]> {
  const after = await captureTestSignatures(cwd);
  const findings: Finding[] = [];
  for (const [path, signature] of Object.entries(before)) {
    if (!after[path]) { findings.push({ code: "test-deleted", severity: "error", message: "A test file was deleted during the task.", evidence: [path] }); continue; }
    const missing = signature.assertions.filter((assertion) => !after[path]!.assertions.includes(assertion));
    if (missing.length) findings.push({ code: "assertion-changed", severity: "warning", message: "Existing test assertions changed; confirm the change does not weaken behavioral evidence.", evidence: [path, ...missing.slice(0, 3)] });
  }
  return findings;
}
