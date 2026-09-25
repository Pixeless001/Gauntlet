import type { RepoIndex } from "./index.js";
import type { TaskContract } from "../core/events.js";
import type { ConventionFact } from "./conventions.js";
import type { RepositoryLesson } from "./lessons.js";
import type { ActiveExecutionContext } from "../execution-state/reconstruct.js";
import type { ProofPacket } from "../context/proof-views.js";
export interface ContextEntry {
    path: string;
    reason: string;
    score: number;
}
export interface ContextPacket {
    entries: ContextEntry[];
    instructions: string[];
    conventions: ConventionFact[];
    lessons: RepositoryLesson[];
    proof?: ProofPacket[];
    excluded: number;
    execution?: ActiveExecutionContext;
}
export declare function selectContext(cwd: string, contract: TaskContract, limit?: number, conventions?: ConventionFact[], index?: RepoIndex): Promise<ContextPacket>;
export declare function relatedTestCandidates(changed: string[], files: string[]): string[];
