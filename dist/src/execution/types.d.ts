import type { CommandResult } from "../repo/process.js";
export type ExecutionKind = "local" | "worktree" | "sandbox-provider";
export interface ExecutionOptions {
    timeoutMs?: number;
    maxBytes?: number;
}
export interface ExecutionEnvironment {
    kind: ExecutionKind;
    id: string;
    root: string;
    run(command: string, args: string[], options?: ExecutionOptions): Promise<CommandResult>;
}
