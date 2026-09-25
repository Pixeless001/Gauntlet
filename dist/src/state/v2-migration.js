import { createTaskWorld } from "../core/task-state.js";
import { extractContract } from "../core/intent.js";
export function migrateTaskV2(input) {
    if (!input || typeof input !== "object")
        return input;
    const value = input;
    if (value.version !== 2)
        return value;
    const oldContract = value.contract && typeof value.contract === "object" ? value.contract : {};
    const intent = typeof oldContract.intent === "string" ? oldContract.intent : "";
    const contract = { ...extractContract(intent), ...oldContract, intent };
    const baseline = value.baseline && typeof value.baseline === "object" ? value.baseline : {};
    const world = createTaskWorld(contract, typeof baseline.head === "string" ? baseline.head : null);
    return { ...value, version: 3, contract, world };
}
