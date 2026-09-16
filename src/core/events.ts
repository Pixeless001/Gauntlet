import { z } from "zod";

export const stateReportSchema = z.object({
  kind: z.enum(["hypothesis", "cause_validated", "implementation_selected", "approach_rejected", "verification"]),
  summary: z.string().min(1).max(1_000),
  constraints: z.array(z.string().max(500)).max(20).default([]),
  relevantFiles: z.array(z.string().max(500)).max(50).default([]),
  relevantSymbols: z.array(z.string().max(500)).max(50).default([]),
  evidenceRefs: z.array(z.string().max(500)).max(50).default([]),
});

export const activitySchema = z.object({
  kind: z.enum(["command", "file_read", "file_write", "search", "test_result", "diff_change", "decision_signal", "message"]),
  target: z.string().optional(),
  outcome: z.enum(["pass", "fail", "unknown"]).optional(),
  outputBytes: z.number().int().nonnegative().default(0),
  evidenceRef: z.string().optional(),
  report: stateReportSchema.optional(),
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
  base.extend({ type: z.literal("before_stop") }),
]);

export type GauntletEvent = z.infer<typeof eventSchema>;
export type TaskActivity = z.infer<typeof activitySchema>;
export type StateReport = z.infer<typeof stateReportSchema>;

export interface TaskContract {
  intent: string;
  acceptanceCriteria: string[];
  explicitPaths: string[];
  constraints: string[];
}

export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  blocking?: boolean;
  message: string;
  evidence: string[];
}
