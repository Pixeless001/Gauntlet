import type { TaskContract } from "../core/events.js";
import type { UncertaintyKind } from "../control/uncertainty.js";

export type WorkNodeState = "BLOCKED" | "READY" | "RUNNING" | "CANDIDATE" | "VALIDATED" | "REJECTED" | "STALE" | "COLLAPSED";
export type WorkNodeKind = "implementation" | "inspection" | "evidence" | "verification" | "local";
export type ExecutorKind = "primary" | "local" | "worker" | "verifier";
export type DurationClass = "tiny" | "short" | "meaningful" | "long";

export interface WorldFingerprint {
  contract: string;
  files: Record<string, string>;
  packages: Record<string, string>;
  rules: string;
  runtime: string;
  value: string;
}

export interface WorldFact {
  id: string;
  provenance: string;
  statement: string;
  evidenceRefs: string[];
  fingerprint: string;
  version: number;
  status: "validated" | "stale";
}

export interface CandidateResult {
  nodeId: string;
  attempt: number;
  executor: ExecutorKind;
  inputFingerprint: string;
  claims: string[];
  artifactRefs: string[];
  evidenceRefs: string[];
  affectedPaths: string[];
  unresolved: UncertaintyKind[];
  patchRef?: string;
  baseRevision?: string;
  approachFingerprint?: string;
}

export interface WorkNode {
  id: string;
  title: string;
  kind: WorkNodeKind;
  executor: ExecutorKind;
  required: boolean;
  state: WorkNodeState;
  attempt: number;
  duration: DurationClass;
  dependencies: string[];
  validityInputs: string[];
  writePaths: string[];
  resolves: UncertaintyKind[];
  evidenceRefs: string[];
  candidate?: CandidateResult;
  rejection?: { constraint: string; evidenceRef?: string; approachFingerprint?: string };
  collapsedRef?: string;
  criticalPath: number;
}

export interface WorkGraph { version: number; nodes: Record<string, WorkNode>; }
export interface ValidityEdge { from: string; to: string; }
export interface ValidityGraph { version: number; edges: ValidityEdge[]; }
export interface CommunicationEdge { from: string; to: string; }
export interface CommunicationGraph { version: number; edges: CommunicationEdge[]; }

export interface DecisionSnapshot {
  revision: number;
  fingerprint: string;
  candidates: string[];
  valid: boolean;
}

export interface CurrentValidWorld {
  version: 1;
  revision: number;
  contractVersion: number;
  contract: TaskContract;
  expectedScope: string[];
  canonicalRevision: string | null;
  fingerprint: WorldFingerprint;
  facts: Record<string, WorldFact>;
  work: WorkGraph;
  validity: ValidityGraph;
  communication: CommunicationGraph;
  uncertainties: UncertaintyKind[];
  rules: string[];
  legalActions: string[];
  capabilities: string[];
  ownership: Record<string, string[]>;
  evidenceRefs: string[];
  decision: DecisionSnapshot;
  appliedEvent: number;
}

export interface WorkNodeInput {
  id: string;
  title: string;
  kind: WorkNodeKind;
  executor?: ExecutorKind;
  required?: boolean;
  duration?: DurationClass;
  dependencies?: string[];
  validityInputs?: string[];
  writePaths?: string[];
  resolves?: UncertaintyKind[];
}

export interface GraphProposal extends WorkNodeInput {
  changes: { scheduling?: boolean; validation?: boolean; invalidation?: boolean; reuse?: boolean; authority?: boolean; recovery?: boolean };
}

export interface GraphEvent {
  sequence: number;
  at: string;
  type: "NODE_CREATED" | "DEPENDENCY_ADDED" | "NODE_READY" | "NODE_STARTED" | "RESULT_PROPOSED" | "RESULT_VALIDATED" | "RESULT_REJECTED" | "RESULT_STALE" | "FACT_INVALIDATED" | "DESCENDANTS_STALE" | "NODE_RETRIED" | "PATCH_PROMOTED" | "WORKER_CANCELLED" | "GRAPH_COLLAPSED";
  nodeId?: string;
  detail?: string;
  fingerprint?: string;
  attempt?: number;
  candidate?: CandidateResult;
}

export interface ExecutionEngine {
  runReady(nodes: WorkNode[], signal?: AbortSignal): Promise<CandidateResult[]>;
  cancel(ids: string[]): Promise<void>;
  checkpoint(taskId: string, world: CurrentValidWorld): Promise<void>;
  resume(taskId: string): Promise<CurrentValidWorld | null>;
}

export interface WorldSeed {
  contract: TaskContract;
  canonicalRevision: string | null;
  fingerprint: WorldFingerprint;
}
