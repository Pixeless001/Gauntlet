import type { ArmOutcome } from "./runner.js";
export interface ArmSummary {
    arm: "baseline" | "treatment";
    runs: number;
    acceptanceRate: number;
    preservationRate: number;
    slopFreeRate: number;
    firstCleanPassRate: number;
    medianWallMs: number;
    medianLocAdded: number;
    tokensReported: number;
}
export interface BenchmarkReport {
    generatedAt: string;
    harness: string;
    model?: string | undefined;
    endpoint?: string | undefined;
    summary: Record<"baseline" | "treatment", ArmSummary>;
    tasks: {
        task: string;
        repeats: number;
        acceptance: {
            baseline: number;
            treatment: number;
        };
        preservation: {
            baseline: number;
            treatment: number;
        };
        slopFree: {
            baseline: number;
            treatment: number;
        };
        slopCodes: {
            baseline: string[];
            treatment: string[];
        };
        medianWallMs: {
            baseline: number;
            treatment: number;
        };
        medianLocAdded: {
            baseline: number;
            treatment: number;
        };
    }[];
    outcomes: ArmOutcome[];
}
export declare function buildReport(outcomes: ArmOutcome[], meta: {
    harness: string;
    model?: string | undefined;
    endpoint?: string | undefined;
}): BenchmarkReport;
export declare function formatReport(report: BenchmarkReport): string;
export declare function saveReport(cwd: string, report: BenchmarkReport): Promise<string>;
