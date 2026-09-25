import type { TaskContract } from "../core/events.js";
import type { TaskRisk } from "../core/risk.js";
export declare const uncertaintyKinds: readonly ["intent", "location", "cause", "repoFit", "api", "behavior", "regression", "scope", "visual", "performance"];
export type UncertaintyKind = typeof uncertaintyKinds[number];
export type UncertaintyValue = "open" | "partial" | "resolved" | "irrelevant";
export type UncertaintyState = Record<UncertaintyKind, UncertaintyValue>;
export declare function initialUncertainty(contract: TaskContract, risk: TaskRisk): UncertaintyState;
export declare function unresolved(state: UncertaintyState): UncertaintyKind[];
