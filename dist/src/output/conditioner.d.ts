import type { CommandResult } from "../repo/process.js";
export interface ConditionedOutput {
    summary: string;
    rawBytes: number;
    retainedBytes: number;
    tokensRemoved: number;
    actionableFailures: number;
    truncated: boolean;
}
export declare function conditionOutput(result: CommandResult, limit?: number): ConditionedOutput;
