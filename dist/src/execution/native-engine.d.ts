import type { CandidateResult, CurrentValidWorld, ExecutionEngine, WorkNode } from "../work/types.js";
import { type SchedulerCapabilities } from "../work/scheduler.js";
export type NativeNodeExecutor = (node: WorkNode, signal: AbortSignal) => Promise<CandidateResult>;
export declare class NativeExecutionEngine implements ExecutionEngine {
    private readonly cwd;
    private readonly execute;
    private readonly concurrency;
    private readonly capabilities;
    private readonly controllers;
    constructor(cwd: string, execute: NativeNodeExecutor, concurrency?: number, capabilities?: Partial<SchedulerCapabilities>);
    runReady(nodes: WorkNode[], signal?: AbortSignal): Promise<CandidateResult[]>;
    cancel(ids: string[]): Promise<void>;
    checkpoint(taskId: string, world: CurrentValidWorld): Promise<void>;
    resume(taskId: string): Promise<CurrentValidWorld | null>;
}
