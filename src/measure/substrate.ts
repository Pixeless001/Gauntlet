export interface SubstrateDimension { native: string; langgraphPrototype: string; }

export const LANGGRAPH_PROBE = { package: "@langchain/langgraph", version: "1.4.16", transition: 2, checkpoint: 2, dependencyDirectories: 16, temporary: true, retained: true } as const;

// Recorded sample of `npm run substrate:probe` (win32, Node 24, 2026-09-21).
export const SUBSTRATE_MEASUREMENTS = {
  recordedAt: "2026-09-21",
  reproduce: "npm run substrate:probe",
  native: { importMs: 0, firstInvokeMs: 0.05, warmInvokeWithCheckpointMs: 1.1, dependencyDirs: 0, nodeModulesMB: 0 },
  langgraph: { importMs: 819.5, compileMs: 3.1, firstInvokeMs: 30.7, warmInvokeMs: 19.6, checkpointReadbackOk: true, dependencyDirs: 15, nodeModulesMB: 59 },
} as const;

export const SUBSTRATE_COMPARISON: Record<string, SubstrateDimension> = {
  dependencyFootprint: { native: "no runtime dependency", langgraphPrototype: "external package and transitive dependency tree" },
  sourceComplexity: { native: "small explicit execution boundary", langgraphPrototype: "state annotation, graph, checkpoint configuration" },
  startup: { native: "Node primitives only", langgraphPrototype: "external module load" },
  persistence: { native: "session JSONL plus atomic world checkpoint", langgraphPrototype: "checkpointed shared graph state" },
  frontier: { native: "recomputed from current validity world", langgraphPrototype: "static graph super-steps" },
  cancellation: { native: "AbortController per node", langgraphPrototype: "prototype not selected for host cancellation" },
  staleResults: { native: "local validity-cone traversal", langgraphPrototype: "requires shared-state update policy" },
  concurrency: { native: "bounded Promise.allSettled", langgraphPrototype: "graph scheduler semantics" },
  checkpointResume: { native: "atomic local checkpoint/resume", langgraphPrototype: "MemorySaver checkpoint probe succeeded" },
  coldContext: { native: "communication graph projections", langgraphPrototype: "not a native projection boundary" },
  ownership: { native: "explicit path ownership", langgraphPrototype: "not represented by the prototype" },
  debugging: { native: "JSONL transition log", langgraphPrototype: "state snapshots and threads" },
  eventIntegration: { native: "adapter event translation", langgraphPrototype: "no host adapter advantage" },
  collapse: { native: "evidence checkpoint collapse", langgraphPrototype: "shared state remains checkpoint oriented" },
};

export function substrateProof(): string[] {
  const m = SUBSTRATE_MEASUREMENTS;
  return ["selected: native", "langgraph: disposable non-shipping prototype", `langgraph probe: ${LANGGRAPH_PROBE.package}@${LANGGRAPH_PROBE.version} transition=${LANGGRAPH_PROBE.transition} checkpoint=${LANGGRAPH_PROBE.checkpoint}`, `measured ${m.recordedAt} (${m.reproduce}): native import=${m.native.importMs}ms invoke+warm-checkpoint=${m.native.warmInvokeWithCheckpointMs}ms deps=${m.native.dependencyDirs}dirs; langgraph import=${m.langgraph.importMs}ms warm-invoke=${m.langgraph.warmInvokeMs}ms deps=${m.langgraph.dependencyDirs}dirs/${m.langgraph.nodeModulesMB}MB`, ...Object.entries(SUBSTRATE_COMPARISON).map(([dimension, result]) => `${dimension}: native=${result.native}; langgraph=${result.langgraphPrototype}`)];
}
