import type { FileFingerprint } from "../core/task-state.js";
export interface RepoIndex {
    mode: "git" | "filesystem";
    head: string | null;
    files: string[];
    tests: string[];
    configs: string[];
    dirty: string[];
    fingerprints: Record<string, FileFingerprint>;
}
export declare function fingerprintFiles(cwd: string, paths: string[]): Promise<Record<string, FileFingerprint>>;
export declare function parseStatus(output: string): string[];
export declare function createRepoIndex(cwd: string): Promise<RepoIndex>;
