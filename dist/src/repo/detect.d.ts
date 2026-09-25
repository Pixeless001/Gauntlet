export interface ToolCommand {
    name: string;
    command: string;
    args: string[];
}
export interface RepoProfile {
    packageManager: string | null;
    language: string[];
    dependencies?: string[];
    commands: ToolCommand[];
    harnesses: string[];
    testRunner?: "node" | "vitest" | "jest" | "pytest";
}
export declare function detectDependencies(cwd: string): Promise<string[]>;
export declare function detectRepository(cwd: string): Promise<RepoProfile>;
