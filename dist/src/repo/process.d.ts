export interface CommandResult {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
}
export declare function run(command: string, args: string[], cwd: string, timeoutMs?: number, maxBytes?: number, env?: NodeJS.ProcessEnv): Promise<CommandResult>;
