import { type BenchmarkHarness } from "./agents.js";
export interface BenchmarkOptions {
    harness: BenchmarkHarness;
    model?: string | undefined;
    endpoint?: string | undefined;
    apiKeyEnv?: string | undefined;
    tasks?: string[] | undefined;
    repeats: number;
    timeoutMs: number;
}
export interface ArmOutcome {
    task: string;
    arm: "baseline" | "treatment";
    repeat: number;
    agentExit: number | null;
    agentTimedOut: boolean;
    wallMs: number;
    tokensIn: number | null;
    tokensOut: number | null;
    locAdded: number;
    locRemoved: number;
    filesTouched: number;
    acceptance: boolean;
    preservation: boolean;
    firstCleanPass: boolean;
    slopFindings: {
        code: string;
        message: string;
        proof: string[];
    }[];
    slopFree: boolean;
}
export declare function runBenchmark(options: BenchmarkOptions): Promise<ArmOutcome[]>;
