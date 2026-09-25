import type { ExecutionEnvironment, ExecutionKind, ExecutionOptions } from "./types.js";
export declare class LocalExecutionEnvironment implements ExecutionEnvironment {
    readonly kind: ExecutionKind;
    readonly root: string;
    readonly id: string;
    constructor(root: string, kind?: ExecutionKind);
    run(command: string, args: string[], options?: ExecutionOptions): Promise<import("../repo/process.js").CommandResult>;
}
export declare class ProviderExecutionEnvironment implements ExecutionEnvironment {
    readonly root: string;
    readonly id: string;
    private readonly execute;
    readonly kind: "sandbox-provider";
    constructor(root: string, id: string, execute: ExecutionEnvironment["run"], kind?: "sandbox-provider");
    run(command: string, args: string[], options?: ExecutionOptions): Promise<import("../repo/process.js").CommandResult>;
}
