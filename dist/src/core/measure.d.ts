import type { FileDelta, TaskState } from "./task-state.js";
import type { VerificationResult } from "../verify/types.js";
import type { RuntimeDirective } from "../control/types.js";
import type { CompletionDecision } from "../verify/completion.js";
import type { GraphEvent } from "../work/types.js";
export interface OrchestrationTrace {
    frontierWaitMs: number;
    maxFrontier: number;
    semanticSynthesis: number;
    workerCandidates: number;
}
export interface TaskMeasurement {
    version: 1;
    taskId: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    attempts: number;
    files: number;
    added: number;
    removed: number;
    testsPassed: number;
    checksRun: number;
    clean: boolean;
    verified: boolean;
    firstPass: boolean;
    findings: string[];
    completion?: "complete" | "incomplete" | "semantic-verification-required";
    directive?: RuntimeDirective;
    proof?: {
        id: string;
        status: VerificationResult["status"];
        summary?: string;
        reference?: string;
    }[];
    conventions?: TaskState["conventionMetrics"];
    context?: {
        repeatReadsDetected: number;
        repeatSearchesDetected: number;
        compactions: number;
        skillInvocations: number;
    };
    selection?: {
        interventions: number;
        traces: number;
        averageDepth: number;
        graphExpansions: number;
        externalDocCalls: number;
        browserActivations: number;
        delegations: number;
    };
    memory?: {
        rawEvents: number;
        checkpoints: number;
        activePath: number;
        rejectedBranches: number;
    };
    output?: {
        rawBytes: number;
        visibleBytes: number;
        tokensRemoved: number;
        actionableFailures: number;
        proofReferences: number;
        truncated: number;
    };
    outcome?: {
        complete: boolean;
        missingInvariants: string[];
        proofReferences: number;
    };
    orchestration?: {
        nodes: number;
        requiredNodes: number;
        validatedNodes: number;
        staleNodes: number;
        collapsedNodes: number;
        criticalPath: number;
        decisionRevision: number;
        eventSequence: number;
        totalNodeAttempts: number;
        duplicateEvidence: number;
        frontierWaitMs: number;
        maxFrontier: number;
        fanOutBenefit: number;
        workerCandidates: number;
        semanticSynthesis: number;
        verifierYield: number;
        redoRate: number;
        writeConflicts: number;
    };
}
export declare function measure(state: TaskState, changes: FileDelta[], results: VerificationResult[], now?: Date, completion?: CompletionDecision, trace?: OrchestrationTrace): TaskMeasurement;
export declare function frontierWait(events: readonly Pick<GraphEvent, "at" | "type" | "nodeId">[]): number;
