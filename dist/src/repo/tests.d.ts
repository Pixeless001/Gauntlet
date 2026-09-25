import type { TestSignature } from "../core/task-state.js";
export declare function walk(cwd: string, limit?: number): Promise<string[]>;
export declare function countSkippedTests(cwd: string): Promise<number>;
export declare function captureTestSignatures(cwd: string, files?: string[]): Promise<Record<string, TestSignature>>;
