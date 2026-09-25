import type { TaskState } from "../core/task-state.js";
import type { CandidateResult, WorkNode } from "../work/types.js";
export interface WorkerPacket {
    objective: string;
    knownFacts: string[];
    inputs: string[];
    preserve: string[];
    rules: string[];
    authority: "read-only" | "write";
    ownership: string[];
    acceptance: string[];
    requiredEvidence: string[];
    returnSchema: "CandidateResult";
}
export interface VerificationView {
    goal: string;
    acceptance: string[];
    preservation: string[];
    impact: string[];
    rules: string[];
    candidate: Pick<CandidateResult, "nodeId" | "artifactRefs" | "evidenceRefs" | "affectedPaths" | "patchRef" | "baseRevision">;
}
export declare function compileWorkerPacket(state: TaskState, node: WorkNode): WorkerPacket;
export declare function createVerificationView(state: TaskState, node: WorkNode): VerificationView;
export declare function coldViewHasEvidence(view: VerificationView): boolean;
