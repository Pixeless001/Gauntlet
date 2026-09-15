import type { DelegatedTask } from "../providers/types.js";
import type { TaskState } from "../core/task-state.js";
import { reconstruct } from "./reconstruct.js";

export function delegationHandoff(state: TaskState): DelegatedTask {
  const active = reconstruct(state);
  return { goal: active.task, acceptanceCriteria: active.acceptanceCriteria, constraints: active.constraints, scope: active.relevantFiles.slice(0, 16), relevantFiles: active.relevantFiles.slice(0, 16), activeRules: (state.conventions ?? []).filter((item) => item.strength === "strong").slice(0, 3).map((item) => item.value) };
}
