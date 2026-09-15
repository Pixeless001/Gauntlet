import type { StructuralIndex } from "./index.js";

export interface WorkingNode { path: string; reason: string; depth: number }

export function workingGraph(index: StructuralIndex, seeds: string[], maxNodes = 24, maxDepth = 2): WorkingNode[] {
  const output: WorkingNode[] = [], seen = new Set<string>(), queue = [...new Set(seeds)].map((path) => ({ path, reason: "task seed", depth: 0 }));
  while (queue.length && output.length < maxNodes) {
    const current = queue.shift()!; if (seen.has(current.path)) continue; seen.add(current.path); output.push(current);
    if (current.depth >= maxDepth) continue;
    for (const path of index.files[current.path]?.imports ?? []) queue.push({ path, reason: `imported by ${current.path}`, depth: current.depth + 1 });
    for (const path of index.dependents[current.path] ?? []) queue.push({ path, reason: `depends on ${current.path}`, depth: current.depth + 1 });
    for (const path of index.files[current.path]?.tests ?? []) queue.push({ path, reason: `tests ${current.path}`, depth: current.depth + 1 });
  }
  return output;
}

export interface ImpactCone { target: string; directDependents: string[]; transitiveDependents: string[]; affectedTests: string[]; packageCrossings: string[]; publicSurface: boolean; truncated: boolean }
export function impact(index: StructuralIndex, target: string, limit = 80): ImpactCone {
  const directDependents = (index.dependents[target] ?? []).slice(0, limit), queue = [...directDependents], seen = new Set<string>();
  while (queue.length && seen.size < limit) { const path = queue.shift()!; if (seen.has(path)) continue; seen.add(path); queue.push(...(index.dependents[path] ?? [])); }
  const transitiveDependents = [...seen], affectedTests = [...new Set([...(index.files[target]?.tests ?? []), ...transitiveDependents.flatMap((path) => index.files[path]?.tests ?? []), ...transitiveDependents.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path))])];
  const owner = index.files[target]?.packageRoot, packageCrossings = transitiveDependents.filter((path) => index.files[path]?.packageRoot !== owner);
  return { target, directDependents, transitiveDependents, affectedTests, packageCrossings, publicSurface: (index.files[target]?.exports.length ?? 0) > 0, truncated: queue.length > 0 || (index.dependents[target]?.length ?? 0) > limit };
}
