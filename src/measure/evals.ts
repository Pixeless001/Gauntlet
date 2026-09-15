export type EvalCategory = "routing" | "behavior" | "enforcement" | "context" | "verification" | "overhead" | "domain" | "portability";
export interface EvalResult {
  category: EvalCategory; caseId: string; passed: boolean; durationMs: number; interventions: number; extraModelCalls: number;
  contextItems: number; repeatedReads: number; rawOutputBytes: number; conditionedOutputBytes: number; evidence: string[];
}

export function silenceResult(caseId: string, durationMs: number, values: Partial<EvalResult> = {}): EvalResult {
  return { category: "overhead", caseId, passed: true, durationMs, interventions: 0, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, evidence: [], ...values };
}
