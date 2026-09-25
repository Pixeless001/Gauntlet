import type { ToolPayload } from "../core/events.js";
import type { CommandResult } from "../repo/process.js";
export type ArtifactDetail = "reference" | "concise" | "detailed" | "raw";
export interface ArtifactMetadata {
    version: 2;
    id: string;
    taskId: string;
    artifactRef: string;
    operation: string;
    target?: string;
    status: ToolPayload["status"];
    semanticDescription: string;
    paths: string[];
    symbols: string[];
    eventIndex: number;
    processor: ToolPayload["processor"];
    inputHash: string;
    outputHash: string;
    inputBytes: number;
    outputBytes: number;
    createdAt: string;
}
export interface ArtifactReadOptions {
    detail?: ArtifactDetail;
    lines?: {
        start: number;
        end: number;
    };
}
export declare class ArtifactStore {
    private readonly cwd;
    private readonly root;
    constructor(cwd: string);
    put(taskId: string, payload: ToolPayload, eventIndex?: number, goal?: string, uncertainty?: string): Promise<ArtifactMetadata>;
    metadata(handle: string): Promise<ArtifactMetadata>;
    raw(handle: string): Promise<Buffer>;
    read(handle: string, options?: ArtifactReadOptions): Promise<string>;
    private directory;
}
export declare function storeOutput(cwd: string, result: CommandResult, taskId?: string, eventIndex?: number): Promise<string>;
export declare function parseArtifactHandle(handle: string): {
    taskId: string;
    id: string;
};
