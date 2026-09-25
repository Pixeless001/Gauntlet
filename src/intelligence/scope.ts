import type { TaskContract } from "../core/events.js";
import type { FileDelta } from "../core/task-state.js";
import type { StructuralIndex } from "./index.js";
import { inspectImpact } from "./working-graph.js";

export interface ScopeAssessment { expected: string[]; actual: string[]; unexpected: string[]; hardSignals: string[]; softSignals: string[] }

export function expectedScope(contract: TaskContract, index?: StructuralIndex): string[] {
  const direct = [...new Set([...contract.expectedFrontier, ...contract.explicitPaths])];
  if (!index) return direct;
  return [...new Set(direct.flatMap((path) => { const impact = inspectImpact(index, path); return [path, ...impact.dependencies, ...impact.callers, ...impact.tests]; }))];
}

export function assessScope(contract: TaskContract, changes: FileDelta[], beforeDependencies: string[], afterDependencies: string[], index?: StructuralIndex, publicExports: Record<string, string[]> = {}): ScopeAssessment {
  const expected = expectedScope(contract, index), actual = changes.map((item) => item.path), unexpected = actual.filter((path) => !expected.includes(path));
  const hardSignals: string[] = [], softSignals: string[] = [];
  const addedDependencies = afterDependencies.filter((item) => !beforeDependencies.includes(item));
  const unrequestedDependencies = addedDependencies.filter((item) => !contract.intent.toLowerCase().includes(item.toLowerCase()));
  if (unrequestedDependencies.length) hardSignals.push(`unrequested dependency: ${unrequestedDependencies.join(", ")}`);
  for (const change of changes) {
    const target = index ? inspectImpact(index, change.path) : null;
    const bounded = contract.size === "tiny" || contract.size === "local";
    const addedExports = (index?.files[change.path]?.exports ?? []).filter((name) => !(publicExports[change.path] ?? []).includes(name));
    const requestedPublicChange = /\b(?:public|api|export|expose)\b/i.test(contract.intent) || !publicExports[change.path] && contract.explicitPaths.includes(change.path);
    if (bounded && addedExports.length && !requestedPublicChange) hardSignals.push(`unrequested public exports: ${change.path} (${addedExports.join(", ")})`);
    if (bounded && target?.publicSurface && !expected.includes(change.path)) hardSignals.push(`unexpected public surface: ${change.path}`);
    if (bounded && target?.packageCrossings.length && !expected.includes(change.path)) hardSignals.push(`unexpected package crossing: ${change.path}`);
    if (bounded && /(?:^|\/)(?:migrations?|schema|auth|security|permissions?)(?:\/|\.|$)/i.test(change.path) && !contract.explicitPaths.includes(change.path)) hardSignals.push(`unexpected boundary change: ${change.path}`);
    if (change.added > 250 &&!hardSignals.some((item) => item.endsWith(change.path))) softSignals.push(`large local change: ${change.path}`);
  }
  const grown = changes.filter((change) => change.added > 0);
  if (grown.length > 8 && !hardSignals.length) softSignals.push(`broad local footprint: ${grown.length} files`);
  return { expected, actual, unexpected, hardSignals: [...new Set(hardSignals)], softSignals: [...new Set(softSignals)] };
}
