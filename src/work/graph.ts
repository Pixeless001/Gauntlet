import { createHash } from "node:crypto";
import type { CandidateResult, CommunicationGraph, CurrentValidWorld, DurationClass, GraphProposal, ValidityGraph, WorkGraph, WorkNode, WorkNodeInput } from "./types.js";

const durationWeight: Record<DurationClass, number> = { tiny: 1, short: 2, meaningful: 3, long: 4 };

export function createGraph(): WorkGraph { return { version: 1, nodes: {} }; }
export function createValidityGraph(): ValidityGraph { return { version: 1, edges: [] }; }
export function createCommunicationGraph(): CommunicationGraph { return { version: 1, edges: [] }; }

export function nodeEarnsStructure(proposal: GraphProposal): boolean {
  return Object.values(proposal.changes).some(Boolean);
}

export function addNode(graph: WorkGraph, input: WorkNodeInput): WorkGraph {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(input.id)) throw new Error("Invalid work node id");
  if (graph.nodes[input.id]) throw new Error(`Work node already exists: ${input.id}`);
  const dependencies = [...new Set(input.dependencies ?? [])];
  if (dependencies.some((id) => !graph.nodes[id])) throw new Error("Work dependency is missing");
  const node: WorkNode = {
    id: input.id, title: input.title, kind: input.kind, executor: input.executor ?? "primary", required: input.required ?? true,
    state: dependencies.length ? "BLOCKED" : "READY", attempt: 1, duration: input.duration ?? "short", dependencies,
    validityInputs: [...new Set(input.validityInputs ?? [])], writePaths: [...new Set(input.writePaths ?? [])], resolves: [...new Set(input.resolves ?? [])], evidenceRefs: [], criticalPath: 0,
  };
  const next = { version: graph.version + 1, nodes: { ...graph.nodes, [node.id]: node } };
  assertAcyclic(next); return annotateCriticalPath(next);
}

export function addValidityEdges(graph: ValidityGraph, node: WorkNode): ValidityGraph {
  const edges = [...graph.edges, ...node.validityInputs.map((from) => ({ from, to: node.id }))];
  return { version: graph.version + 1, edges: uniqueEdges(edges) };
}

export function addCommunicationEdge(graph: CommunicationGraph, from: string, to: string): CommunicationGraph {
  return { version: graph.version + 1, edges: uniqueEdges([...graph.edges, { from, to }]) };
}

export function readyFrontier(world: CurrentValidWorld): WorkNode[] {
  const nodes = recomputeReady(world.work).nodes;
  const next = { ...world, work: { ...world.work, nodes } };
  return Object.values(nodes).filter((node) => node.state === "READY" && node.validityInputs.every((input) => next.facts[input]?.status !== "stale") && writeOwnershipConflicts(next, node).length === 0).sort(compareReady);
}

export function recomputeReady(graph: WorkGraph): WorkGraph {
  const nodes = Object.fromEntries(Object.values(graph.nodes).map((node) => {
    if (node.state !== "BLOCKED") return [node.id, node];
    const ready = node.dependencies.every((id) => graph.nodes[id]?.state === "VALIDATED" || graph.nodes[id]?.state === "COLLAPSED");
    return [node.id, ready ? { ...node, state: "READY" as const } : node];
  })) as Record<string, WorkNode>;
  return annotateCriticalPath({ version: graph.version + 1, nodes });
}

export function startNode(graph: WorkGraph, id: string): WorkGraph {
  const node = requiredNode(graph, id);
  if (node.state !== "READY") throw new Error(`Work node is not ready: ${id}`);
  return replaceNode(graph, { ...node, state: "RUNNING" });
}

export function proposeResult(graph: WorkGraph, result: CandidateResult): WorkGraph {
  const node = requiredNode(graph, result.nodeId);
  if (node.state !== "RUNNING") throw new Error(`Work node is not running: ${result.nodeId}`);
  if (node.attempt !== result.attempt) throw new Error("Candidate attempt does not match work node");
  return replaceNode(graph, { ...node, state: "CANDIDATE", candidate: result, evidenceRefs: unique([...node.evidenceRefs, ...result.evidenceRefs, ...result.artifactRefs]) });
}

export function validateNode(graph: WorkGraph, id: string): WorkGraph {
  const node = requiredNode(graph, id);
  if (node.state !== "CANDIDATE") throw new Error(`Work node is not a candidate: ${id}`);
  const { candidate: _candidate, rejection: _rejection, ...rest } = node;
  return recomputeReady(replaceNode(graph, { ...rest, state: "VALIDATED" }));
}

export function rejectNode(graph: WorkGraph, id: string, constraint: string, evidenceRef?: string, approachFingerprint?: string): WorkGraph {
  const node = requiredNode(graph, id);
  if (node.state !== "CANDIDATE" && node.state !== "RUNNING") throw new Error(`Work node cannot be rejected: ${id}`);
  const { candidate: _candidate, ...rest } = node;
  return replaceNode(graph, { ...rest, state: "REJECTED", rejection: { constraint, ...(evidenceRef ? { evidenceRef } : {}), ...(approachFingerprint ? { approachFingerprint } : {}) } });
}

export function retryNode(graph: WorkGraph, id: string): WorkGraph {
  const node = requiredNode(graph, id);
  if (node.state !== "REJECTED" && node.state !== "STALE") throw new Error(`Work node cannot be retried: ${id}`);
  const dependenciesValid = node.dependencies.every((dependency) => ["VALIDATED", "COLLAPSED"].includes(graph.nodes[dependency]?.state ?? ""));
  const { candidate: _candidate, ...rest } = node;
  return replaceNode(graph, { ...rest, state: dependenciesValid ? "READY" : "BLOCKED", attempt: node.attempt + 1 });
}

export function invalidateCone(world: CurrentValidWorld, source: string): { world: CurrentValidWorld; stale: string[]; cancel: string[] } {
  const stale = descendants(world.validity, source), nodes = { ...world.work.nodes }, cancel: string[] = [];
  for (const id of stale) {
    const node = nodes[id]; if (!node || ["REJECTED", "COLLAPSED", "STALE"].includes(node.state)) continue;
    if (node.state === "RUNNING") cancel.push(id);
    const { candidate: _candidate, ...rest } = node;
    nodes[id] = { ...rest, state: "STALE" };
  }
  const facts = { ...world.facts, ...(world.facts[source] ? { [source]: { ...world.facts[source]!, status: "stale" as const } } : {}) };
  return { world: invalidateDecision({ ...world, revision: world.revision + 1, facts, work: { version: world.work.version + 1, nodes }, validity: { ...world.validity, version: world.validity.version + 1 } }), stale, cancel };
}

export function collapseValidated(world: CurrentValidWorld): CurrentValidWorld {
  const activeInputs = new Set(world.validity.edges.filter((edge) => {
    const target = world.work.nodes[edge.to]; return target && !["VALIDATED", "COLLAPSED"].includes(target.state);
  }).map((edge) => edge.from));
  const nodes = Object.fromEntries(Object.values(world.work.nodes).map((node) => {
    if (node.state !== "VALIDATED" || activeInputs.has(node.id)) return [node.id, node];
    const { candidate: _candidate, ...rest } = node;
    return [node.id, { ...rest, state: "COLLAPSED" as const, collapsedRef: `world://${world.revision}/${node.id}` }];
  })) as Record<string, WorkNode>;
  return invalidateDecision({ ...world, revision: world.revision + 1, work: { version: world.work.version + 1, nodes } });
}

export function communicationEvidence(world: CurrentValidWorld, recipient: string): string[] {
  const allowed = new Set(world.communication.edges.filter((edge) => edge.to === recipient).map((edge) => edge.from));
  return Object.values(world.work.nodes).filter((node) => allowed.has(node.id)).flatMap((node) => node.evidenceRefs).filter(uniqueFilter);
}

export function writeOwnershipConflicts(world: CurrentValidWorld, node: WorkNode): string[] {
  return Object.entries(world.ownership).filter(([owner, paths]) => owner !== node.id && node.writePaths.some((path) => paths.includes(path))).map(([owner]) => owner);
}

export function claimOwnership(world: CurrentValidWorld, node: WorkNode): CurrentValidWorld {
  const conflicts = writeOwnershipConflicts(world, node); if (conflicts.length) throw new Error(`Write ownership conflict: ${conflicts.join(", ")}`);
  return invalidateDecision({ ...world, ownership: { ...world.ownership, [node.id]: [...node.writePaths] } });
}

export function releaseOwnership(world: CurrentValidWorld, id: string): CurrentValidWorld {
  if (!(id in world.ownership)) return world;
  const { [id]: _released, ...ownership } = world.ownership;
  return invalidateDecision({ ...world, ownership });
}

export function refreshDecision(world: CurrentValidWorld, candidates: string[]): CurrentValidWorld {
  return { ...world, decision: { revision: world.revision, fingerprint: world.fingerprint.value, candidates: [...new Set(candidates)], valid: true } };
}

export function invalidateDecision(world: CurrentValidWorld): CurrentValidWorld {
  return { ...world, decision: { ...world.decision, valid: false } };
}

export function decisionIsFresh(world: CurrentValidWorld): boolean {
  return world.decision.valid && world.decision.revision === world.revision && world.decision.fingerprint === world.fingerprint.value;
}

export function selectDecisionNode(world: CurrentValidWorld, id: string): WorkNode {
  if (!decisionIsFresh(world)) throw new Error("Decision snapshot is stale");
  if (!world.decision.candidates.includes(id)) throw new Error(`Node is not in the decision menu: ${id}`);
  return requiredNode(world.work, id);
}

export function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function descendants(graph: ValidityGraph, source: string): string[] {
  const output = new Set<string>(), queue = [source];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges.filter((item) => item.from === current)) if (!output.has(edge.to)) { output.add(edge.to); queue.push(edge.to); }
  }
  return [...output];
}
function replaceNode(graph: WorkGraph, node: WorkNode): WorkGraph { return annotateCriticalPath({ version: graph.version + 1, nodes: { ...graph.nodes, [node.id]: node } }); }
function requiredNode(graph: WorkGraph, id: string): WorkNode { const node = graph.nodes[id]; if (!node) throw new Error(`Unknown work node: ${id}`); return node; }
function unique<T>(values: T[]): T[] { return values.filter((value, index) => values.indexOf(value) === index); }
function uniqueFilter(value: string, index: number, values: string[]): boolean { return values.indexOf(value) === index; }
function uniqueEdges<T extends { from: string; to: string }>(edges: T[]): T[] { const seen = new Set<string>(); return edges.filter((edge) => { const key = `${edge.from}:${edge.to}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function compareReady(left: WorkNode, right: WorkNode): number { return Number(right.required) - Number(left.required) || right.criticalPath - left.criticalPath || durationWeight[right.duration] - durationWeight[left.duration] || left.id.localeCompare(right.id); }
function assertAcyclic(graph: WorkGraph): void {
  const visited = new Set<string>(), active = new Set<string>();
  const visit = (id: string): void => { if (active.has(id)) throw new Error("Work graph cycle"); if (visited.has(id)) return; active.add(id); for (const dependency of graph.nodes[id]!.dependencies) visit(dependency); active.delete(id); visited.add(id); };
  for (const id of Object.keys(graph.nodes)) visit(id);
}
function annotateCriticalPath(graph: WorkGraph): WorkGraph {
  const memo = new Map<string, number>();
  const span = (id: string): number => { const cached = memo.get(id); if (cached !== undefined) return cached; const node = graph.nodes[id]!; const value = durationWeight[node.duration] + Math.max(0, ...Object.values(graph.nodes).filter((child) => child.dependencies.includes(id) && child.required).map((child) => span(child.id))); memo.set(id, value); return value; };
  return { ...graph, nodes: Object.fromEntries(Object.values(graph.nodes).map((node) => [node.id, { ...node, criticalPath: span(node.id) }])) };
}
