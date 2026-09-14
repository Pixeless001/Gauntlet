import type { FileDelta, TaskState } from "./task-state.js";
import type { VerificationResult } from "../verify/types.js";

export interface TaskMeasurement {
  version: 1; taskId: string; startedAt: string; finishedAt: string; durationMs: number; attempts: number;
  files: number; added: number; removed: number; testsPassed: number; checksRun: number;
  clean: boolean; verified: boolean; firstPass: boolean; findings: string[];
  conventions?: TaskState["conventionMetrics"];
}

export function measure(state: TaskState, changes: FileDelta[], results: VerificationResult[], now = new Date()): TaskMeasurement {
  const verified = results.length > 0 && results.every((result) => result.status === "pass");
  const clean = state.findings.every((finding) => !(finding.blocking ?? finding.severity !== "info"));
  return { version: 1, taskId: state.id, startedAt: state.startedAt, finishedAt: now.toISOString(), durationMs: Math.max(0, now.getTime() - new Date(state.startedAt).getTime()), attempts: state.attempts, files: changes.length, added: changes.reduce((n, f) => n + f.added, 0), removed: changes.reduce((n, f) => n + f.removed, 0), testsPassed: results.filter((r) => r.id.includes("test") && r.status === "pass").length, checksRun: results.length, clean, verified, firstPass: clean && verified && state.attempts <= 1, findings: state.findings.map((finding) => finding.code), conventions: state.conventionMetrics };
}
