export interface FileRelationship {
    path: string;
    reason: string;
    score: number;
}
export declare function findRelationships(cwd: string, targets: string[], files: string[], maxFiles?: number, maxBytes?: number): Promise<FileRelationship[]>;
