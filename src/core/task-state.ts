import type { Finding, TaskActivity, TaskContract } from "./events.js";
import type { RepositoryFact } from "../repo/memory.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";

export interface FileDelta { path: string; added: number; removed: number }
export interface TestSignature { assertions: string[]; skipped: number }
export interface FileFingerprint { hash: string; lineHashes: string[] }
export interface Baseline {
  head: string | null;
  status: string[];
  dependencies: string[];
  files: Record<string, FileFingerprint>;
  tests: Record<string, TestSignature>;
  index?: RepoIndex;
}

export interface TaskState {
  version: 1;
  id: string;
  repository: string;
  startedAt: string;
  contract: TaskContract;
  baseline: Baseline;
  workingSet: string[];
  repositoryFacts: RepositoryFact[];
  conventions?: ConventionFact[];
  conventionMetrics?: { hints: number; primitives: number; interventions: number; dependencyConflicts: number; duplicates: number; architectureBypasses: number };
  activities: TaskActivity[];
  findings: Finding[];
  attempts: number;
}
