import { createTaskWorld } from "../core/task-state.js";
import { extractContract } from "../core/intent.js";

export function migrateTaskV2(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  if (value.version !== 2) return value;
  const oldContract = value.contract && typeof value.contract === "object" ? value.contract as Record<string, unknown> : {};
  const intent = typeof oldContract.intent === "string" ? oldContract.intent : "";
  const contract = { ...extractContract(intent), ...oldContract, intent };
  const baseline = value.baseline && typeof value.baseline === "object" ? value.baseline as { head?: unknown } : {};
  const world = createTaskWorld(contract, typeof baseline.head === "string" ? baseline.head : null);
  return { ...value, version: 3, contract, world };
}
