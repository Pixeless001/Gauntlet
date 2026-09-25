import type { TaskMeasurement } from "../core/measure.js";
import type { BenchmarkReport } from "../benchmark/report.js";
/** finish can run twice per task (retry); the last entry per taskId wins. Read-only turns are excluded. */
export declare function loadHistory(cwd: string): Promise<TaskMeasurement[]>;
export declare function latestBenchmark(cwd: string): Promise<BenchmarkReport | null>;
export declare function formatStats(history: TaskMeasurement[], benchmark: BenchmarkReport | null): string;
