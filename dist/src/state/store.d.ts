import { type TaskState } from "../core/task-state.js";
import type { TaskMeasurement } from "../core/measure.js";
import type { GraphEvent } from "../work/types.js";
export declare class StateStore {
    readonly directory: string;
    private readonly repository;
    constructor(cwd: string);
    private taskPath;
    private atomicWrite;
    saveTask(state: TaskState): Promise<void>;
    loadTask(id: string): Promise<TaskState>;
    updateTask(id: string, update: (state: TaskState) => void): Promise<TaskState>;
    updateTaskWithWorldEvent(id: string, update: (state: TaskState) => Omit<GraphEvent, "sequence"> | Omit<GraphEvent, "sequence">[] | null): Promise<TaskState>;
    private withTaskLock;
    saveMeasurement(value: TaskMeasurement): Promise<void>;
    loadMeasurement(): Promise<TaskMeasurement | null>;
}
