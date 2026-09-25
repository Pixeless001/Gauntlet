import type { Baseline, FileDelta } from "../core/task-state.js";
export declare function captureBaseline(cwd: string): Promise<Baseline>;
export declare function changedFiles(cwd: string, baseline?: Baseline): Promise<FileDelta[]>;
export declare function captureBinaryDiff(cwd: string, base: string | null): Promise<string | null>;
