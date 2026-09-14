import { z } from "zod";

export const activitySchema = z.object({
  kind: z.enum(["command", "file_read", "file_write", "message"]),
  target: z.string().optional(),
  outcome: z.enum(["pass", "fail", "unknown"]).optional(),
  outputBytes: z.number().int().nonnegative().default(0),
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

export interface TaskContract {
  intent: string;
  acceptanceCriteria: string[];
  explicitPaths: string[];
  constraints: string[];
}

export interface Finding {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  evidence: string[];
}
