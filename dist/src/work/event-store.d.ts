import type { CurrentValidWorld, GraphEvent } from "./types.js";
export declare class GraphEventStore {
    private readonly root;
    constructor(cwd: string);
    append(taskId: string, event: Omit<GraphEvent, "sequence">, world: CurrentValidWorld): Promise<GraphEvent>;
    read(taskId: string, after?: number): Promise<GraphEvent[]>;
    resume(taskId: string): Promise<{
        sequence: number;
        world: CurrentValidWorld;
    } | null>;
    private directory;
}
