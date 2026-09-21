export interface SubstrateDimension { native: string; langgraphPrototype: string; }

export const LANGGRAPH_PROBE = { package: "@langchain/langgraph", version: "1.4.16", transition: 2, checkpoint: 2, dependencyDirectories: 16, temporary: true, retained: true } as const;

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
  return ["selected: native", "langgraph: disposable non-shipping prototype", `langgraph probe: ${LANGGRAPH_PROBE.package}@${LANGGRAPH_PROBE.version} transition=${LANGGRAPH_PROBE.transition} checkpoint=${LANGGRAPH_PROBE.checkpoint}`, ...Object.entries(SUBSTRATE_COMPARISON).map(([dimension, result]) => `${dimension}: native=${result.native}; langgraph=${result.langgraphPrototype}`)];
}
