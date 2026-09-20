import { z } from "zod";
import type { TaskSize } from "../control/types.js";

export const stateReportSchema = z.object({
  kind: z.enum(["hypothesis", "cause_validated", "implementation_selected", "approach_rejected", "verification"]),
  summary: z.string().min(1).max(1_000),
  constraints: z.array(z.string().max(500)).max(20).default([]),
  relevantFiles: z.array(z.string().max(500)).max(50).default([]),
  relevantSymbols: z.array(z.string().max(500)).max(50).default([]),
  proofRefs: z.array(z.string().max(500)).max(50).default([]),
});

export const toolPayloadSchema = z.object({
  operation: z.string().min(1).max(200),
  target: z.string().max(1_000).optional(),
  input: z.string(),
  output: z.string(),
  status: z.enum(["pass", "fail", "timeout", "unavailable", "unknown"]),
  semanticDescription: z.string().max(1_000).optional(),
  paths: z.array(z.string().max(500)).max(100).default([]),
  symbols: z.array(z.string().max(500)).max(100).default([]),
  processor: z.enum(["log", "test", "json", "diff", "search", "browser", "code"]).default("log"),
});

export const activitySchema = z.object({
  kind: z.enum(["command", "file_read", "file_write", "search", "test_result", "diff_change", "decision_signal", "message"]),
  target: z.string().optional(),
  outcome: z.enum(["pass", "fail", "unknown"]).optional(),
  outputBytes: z.number().int().nonnegative().default(0),
  proofRef: z.string().optional(),
  artifactRef: z.string().optional(),
  report: stateReportSchema.optional(),
  toolPayload: toolPayloadSchema.optional(),
});

export const taskContractSchema = z.object({
  intent: z.string(),
  goal: z.string().min(1).max(2_000),
  acceptanceCriteria: z.array(z.string().max(1_000)).max(50),
  preservationRequirements: z.array(z.string().max(1_000)).max(50),
  constraints: z.array(z.string().max(1_000)).max(50),
  unknowns: z.array(z.string().max(1_000)).max(20),
  explicitPaths: z.array(z.string().max(500)).max(100),
  expectedFrontier: z.array(z.string().max(500)).max(200),
  requiredProof: z.array(z.string().max(200)).max(20),
  size: z.enum(["tiny", "local", "distributed", "systemic"]),
});

const base = z.object({
  version: z.literal(1),
  taskId: z.string().min(1),
  repository: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const eventSchema = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("task_start"), intent: z.string().min(1) }),
  base.extend({ type: z.literal("task_activity"), activity: activitySchema }),
  base.extend({ type: z.literal("lifecycle"), phase: z.enum(["pre_compact", "post_compact"]) }),
  base.extend({ type: z.literal("before_stop") }),
]);

export type GauntletEvent = z.infer<typeof eventSchema>;
export type TaskActivity = z.infer<typeof activitySchema>;
export type ToolPayload = z.infer<typeof toolPayloadSchema>;
export type StoredTaskActivity = Omit<TaskActivity, "toolPayload">;
export type StateReport = z.infer<typeof stateReportSchema>;

export interface TaskContract extends z.infer<typeof taskContractSchema> { size: TaskSize }

export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  blocking?: boolean;
  message: string;
  proof: string[];
}
