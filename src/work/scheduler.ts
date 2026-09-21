import type { WorkNode } from "./types.js";

export interface SchedulerCapabilities { isolatedMutation: boolean; maxLocal?: number; maxWorkers?: number; openUncertainties?: readonly string[]; }

export function scheduleReady(nodes: WorkNode[], capabilities: SchedulerCapabilities): WorkNode[] {
  const localLimit = capabilities.maxLocal ?? 4, workerLimit = capabilities.maxWorkers ?? 1;
  const selected: WorkNode[] = [], claimed = new Set<string>(); let workers = 0, mutationSelected = false;
  for (const node of nodes.filter((node) => node.state === "READY").sort((left, right) => rank(left, right, capabilities.openUncertainties ?? []))) {
    if (node.executor === "worker" && workers >= workerLimit) continue;
    const mutation = node.writePaths.length > 0;
    if (mutation && (mutationSelected && !capabilities.isolatedMutation || node.writePaths.some((path) => claimed.has(path)))) continue;
    if (!mutation && selected.filter((item) => !item.writePaths.length).length >= localLimit) continue;
    selected.push(node);
    if (node.executor === "worker") workers += 1;
    if (mutation) mutationSelected = true;
    for (const path of node.writePaths) claimed.add(path);
  }
  return selected;
}

function rank(left: WorkNode, right: WorkNode, openUncertainties: readonly string[]): number {
  return Number(right.required) - Number(left.required)
    || right.criticalPath - left.criticalPath
    || resolvedCount(right, openUncertainties) - resolvedCount(left, openUncertainties)
    || verificationRank(left) - verificationRank(right)
    || left.id.localeCompare(right.id);
}

function verificationRank(node: WorkNode): number { return node.kind === "verification" ? -1 : node.required ? 0 : 1; }
function resolvedCount(node: WorkNode, open: readonly string[]): number { return node.resolves.filter((kind) => open.includes(kind)).length; }
