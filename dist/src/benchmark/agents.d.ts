export interface AgentInvocation {
    cwd: string;
    prompt: string;
    model?: string | undefined;
    endpoint?: string | undefined;
    apiKeyEnv?: string | undefined;
    timeoutMs: number;
}
export interface AgentRun {
    exitCode: number | null;
    wallMs: number;
    stdoutTail: string;
    stderrTail: string;
    timedOut: boolean;
    tokensIn: number | null;
    tokensOut: number | null;
}
export interface AgentDriver {
    name: BenchmarkHarness;
    detect(): Promise<boolean>;
    listModels(options: {
        endpoint?: string | undefined;
        apiKeyEnv?: string | undefined;
    }): Promise<string[]>;
    run(invocation: AgentInvocation): Promise<AgentRun>;
}
export type BenchmarkHarness = "codex" | "claude-code" | "opencode";
export declare function getDriver(harness: BenchmarkHarness): AgentDriver;
export declare function detectDrivers(): Promise<Record<BenchmarkHarness, boolean>>;
export declare function scanTokenUsage(output: string): {
    tokensIn: number | null;
    tokensOut: number | null;
};
