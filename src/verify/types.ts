import type { CommandResult } from "../repo/process.js";
import type { SelectionTrace } from "../control/selector.js";

export interface VerificationCheck { id: string; reason: string; command: string; args: string[]; timeoutMs?: number }
export interface VerificationResult extends CommandResult { id: string; reason: string; status: "pass" | "fail" | "timeout" | "unavailable"; summary?: string; evidence?: string }
export interface VerificationPlan { checks: VerificationCheck[]; rationale: string[]; selectionTrace?: SelectionTrace }
