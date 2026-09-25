import type { EvalResult } from "./evals.js";
export declare const evalSuites: readonly ["decisions", "repository", "ablation", "interaction", "replay", "orchestration", "substrate", "sparse-communication", "topology-adaptation", "work-reduction", "critical-path-scheduling", "validity-recomputation", "shared-state-leakage", "heavy-workflow-suppression", "cold-verification", "dynamic-growth", "action-menu-freshness", "native-conformance"];
export type EvalSuite = typeof evalSuites[number];
export declare function runBuiltInEvals(): EvalResult[];
export declare function runEvalSuite(suite: EvalSuite): Promise<EvalResult[]>;
export declare function saveEvalRun(cwd: string, results: EvalResult[]): Promise<string>;
