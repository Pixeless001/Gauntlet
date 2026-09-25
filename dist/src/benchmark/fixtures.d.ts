export interface BenchmarkTask {
    id: string;
    intent: string;
    files: Record<string, string>;
    referenceFix: Record<string, string>;
}
export declare function benchmarkTasks(): BenchmarkTask[];
export declare function scaffoldTask(parent: string, task: BenchmarkTask): Promise<string>;
export interface TaskValidation {
    task: string;
    discriminatingFailsOnBase: boolean;
    preservationPassesOnBase: boolean;
    passesOnFix: boolean;
    preservationPassesOnFix: boolean;
}
export declare function validateTask(parent: string, task: BenchmarkTask): Promise<TaskValidation>;
