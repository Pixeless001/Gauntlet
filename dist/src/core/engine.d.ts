import { type TaskMeasurement } from "./measure.js";
import type { TaskActivity } from "./events.js";
import { type TaskState } from "./task-state.js";
import { type ContinuationRecord } from "./compact.js";
import { type CounterfactualEnvironment } from "../verify/counterfactual.js";
import { type ProofKind } from "../verify/proof-selector.js";
import { type WorkerPacket } from "../evidence/packets.js";
import { type Capability, type CapabilityKind } from "../capabilities/registry.js";
import type { HarnessName } from "../adapters/types.js";
import type { RuntimeDirective } from "../control/types.js";
import type { CandidateResult } from "../work/types.js";
import { type SemanticSynthesisRequest } from "../work/reducer.js";
export interface StartResult {
    state: TaskState;
    injection: string;
    clarification: string | null;
    directive: RuntimeDirective;
}
export interface ActivityResult {
    state: TaskState;
    continuation: ContinuationRecord | null;
    directive: RuntimeDirective;
    notices: string[];
}
export interface LifecycleResult {
    state: TaskState;
    continuation: ContinuationRecord;
}
export interface EngineOptions {
    preChangeEnvironment?: (head: string, candidateTests: string[]) => Promise<CounterfactualEnvironment | null>;
    availableProof?: ProofKind[];
    harness?: HarnessName;
    capabilities?: Capability[];
    worker?: (packet: WorkerPacket, signal: AbortSignal) => Promise<Omit<CandidateResult, "nodeId" | "attempt" | "executor" | "inputFingerprint">>;
    synthesize?: (request: SemanticSynthesisRequest) => Promise<CandidateResult[]>;
}
export declare class GauntletEngine {
    readonly cwd: string;
    private readonly options;
    private readonly store;
    private readonly registry;
    private readonly resolver;
    constructor(cwd: string, options?: EngineOptions);
    state(id: string): Promise<TaskState>;
    capability<T>(kind: CapabilityKind): import("../capabilities/resolver.js").Resolution<T>;
    clarify(id: string, question: string, answer: string): Promise<TaskState>;
    start(intent: string, id?: string): Promise<StartResult>;
    activity(id: string, activity: TaskActivity): Promise<ActivityResult>;
    lifecycle(id: string, phase: "pre_compact" | "post_compact"): Promise<LifecycleResult>;
    finish(id: string): Promise<TaskMeasurement>;
    close(id: string): Promise<void>;
    retry(id: string): Promise<void>;
}
