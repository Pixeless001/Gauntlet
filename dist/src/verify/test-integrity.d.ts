import type { Finding } from "../core/events.js";
import type { TestSignature } from "../core/task-state.js";
import type { FileDelta } from "../core/task-state.js";
export declare function inspectTestIntegrity(cwd: string, before: Record<string, TestSignature>, changes?: FileDelta[]): Promise<Finding[]>;
