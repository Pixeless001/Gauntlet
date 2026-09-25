import type { RepoIndex } from "../repo/index.js";
export interface StructuralFile {
    path: string;
    hash?: string;
    packageRoot?: string;
    imports: string[];
    exports: string[];
    symbols: string[];
    tests: string[];
    calls?: string[];
    references?: string[];
    extends?: string[];
    implements?: string[];
}
export interface StructuralIndex {
    version: 1;
    head: string | null;
    files: Record<string, StructuralFile>;
    dependents: Record<string, string[]>;
}
export declare function buildStructuralIndex(cwd: string, repository: RepoIndex, targets?: string[], maxFiles?: number, maxBytes?: number): Promise<StructuralIndex>;
export declare function updateStructuralIndex(cwd: string, repository: RepoIndex, previous: StructuralIndex, changed: string[], maxFiles?: number, maxBytes?: number): Promise<StructuralIndex>;
