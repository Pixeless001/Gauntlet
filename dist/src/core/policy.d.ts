export interface InterventionBudget {
    interventions: number;
    compactions: number;
    expensiveChecks: number;
    skillInvocations: number;
    extraLlmCalls: 0;
}
export declare const DEFAULT_INTERVENTION_BUDGET: InterventionBudget;
export declare const MAX_AUTOMATIC_CORRECTIONS = 1;
export declare const MAX_STATE_BYTES = 256000;
export declare const MAX_CONTEXT_TOKENS = 1200;
