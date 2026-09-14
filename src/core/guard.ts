import type { Finding } from "./events.js";
import type { Baseline, FileDelta, TaskState } from "./task-state.js";
import { detectDependencies } from "../repo/detect.js";
import { captureTestSignatures } from "../repo/tests.js";

export async function evaluateGuards(cwd: string, state: TaskState, changes: FileDelta[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const total = changes.reduce((sum, file) => sum + file.added + file.removed, 0);
  if (changes.length > 8 && total > 300) findings.push({ code: "scope-growth", severity: "warning", message: "The implementation footprint is unusually large; confirm every changed file is task-scoped.", evidence: [`${changes.length} files`, `${total} changed lines`] });
  const dependencies = await detectDependencies(cwd);
  const added = dependencies.filter((item) => !state.baseline.dependencies.includes(item));
  if (added.length) findings.push({ code: "dependency-added", severity: "warning", message: "New runtime dependencies require justification.", evidence: added });
  const tests = await captureTestSignatures(cwd);
  const beforeSkipped = Object.values(state.baseline.tests).reduce((sum, test) => sum + test.skipped, 0);
  const skipped = Object.values(tests).reduce((sum, test) => sum + test.skipped, 0);
  if (skipped > beforeSkipped) findings.push({ code: "tests-skipped", severity: "error", message: "The number of skipped tests increased.", evidence: [`${beforeSkipped} → ${skipped}`] });
  const repeated = loopFinding(state);
  if (repeated) findings.push(repeated);
  return findings;
}

export function loopFinding(state: TaskState): Finding | null {
  const failures = state.activities.filter((item) => item.outcome === "fail" && item.target).map((item) => item.target!);
  const target = failures.find((item) => failures.filter((other) => other === item).length >= 3);
  return target ? { code: "repair-loop", severity: "warning", message: "The same failure occurred at least three times; reassess the underlying assumption.", evidence: [target] } : null;
}

export function dependencyDelta(before: Baseline, after: string[]) { return after.filter((item) => !before.dependencies.includes(item)); }
