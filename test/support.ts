import { extractContract } from "../src/core/intent.js";
import type { TaskContract } from "../src/core/events.js";
import { createControlState, type TaskState } from "../src/core/task-state.js";

export function contract(intent: string, fields: Partial<TaskContract> = {}): TaskContract {
  return { ...extractContract(intent), ...fields };
}

export function taskState(intent: string): TaskState {
  const taskContract = contract(intent);
  return { version: 2, id: "task", repository: process.cwd(), startedAt: new Date(0).toISOString(), contract: taskContract, clarifications: [], baseline: { head: null, status: [], dependencies: [], files: {}, tests: {} }, workingSet: [], repositoryFacts: [], activities: [], findings: [], attempts: 1, control: createControlState(taskContract) };
}
