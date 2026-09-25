import { z } from "zod";
import type { TaskSize } from "../control/types.js";
export declare const stateReportSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        approach_rejected: "approach_rejected";
        cause_validated: "cause_validated";
        hypothesis: "hypothesis";
        implementation_selected: "implementation_selected";
        verification: "verification";
    }>;
    summary: z.ZodString;
    constraints: z.ZodDefault<z.ZodArray<z.ZodString>>;
    relevantFiles: z.ZodDefault<z.ZodArray<z.ZodString>>;
    relevantSymbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
    proofRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const toolPayloadSchema: z.ZodObject<{
    operation: z.ZodString;
    target: z.ZodOptional<z.ZodString>;
    input: z.ZodString;
    output: z.ZodString;
    status: z.ZodEnum<{
        fail: "fail";
        pass: "pass";
        timeout: "timeout";
        unavailable: "unavailable";
        unknown: "unknown";
    }>;
    semanticDescription: z.ZodOptional<z.ZodString>;
    paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    symbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
    processor: z.ZodDefault<z.ZodEnum<{
        browser: "browser";
        code: "code";
        diff: "diff";
        json: "json";
        log: "log";
        search: "search";
        test: "test";
    }>>;
}, z.core.$strip>;
export declare const activitySchema: z.ZodObject<{
    kind: z.ZodEnum<{
        command: "command";
        decision_signal: "decision_signal";
        diff_change: "diff_change";
        file_read: "file_read";
        file_write: "file_write";
        message: "message";
        search: "search";
        test_result: "test_result";
    }>;
    target: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodEnum<{
        fail: "fail";
        pass: "pass";
        unknown: "unknown";
    }>>;
    outputBytes: z.ZodDefault<z.ZodNumber>;
    proofRef: z.ZodOptional<z.ZodString>;
    artifactRef: z.ZodOptional<z.ZodString>;
    report: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            approach_rejected: "approach_rejected";
            cause_validated: "cause_validated";
            hypothesis: "hypothesis";
            implementation_selected: "implementation_selected";
            verification: "verification";
        }>;
        summary: z.ZodString;
        constraints: z.ZodDefault<z.ZodArray<z.ZodString>>;
        relevantFiles: z.ZodDefault<z.ZodArray<z.ZodString>>;
        relevantSymbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
        proofRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    toolPayload: z.ZodOptional<z.ZodObject<{
        operation: z.ZodString;
        target: z.ZodOptional<z.ZodString>;
        input: z.ZodString;
        output: z.ZodString;
        status: z.ZodEnum<{
            fail: "fail";
            pass: "pass";
            timeout: "timeout";
            unavailable: "unavailable";
            unknown: "unknown";
        }>;
        semanticDescription: z.ZodOptional<z.ZodString>;
        paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
        symbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
        processor: z.ZodDefault<z.ZodEnum<{
            browser: "browser";
            code: "code";
            diff: "diff";
            json: "json";
            log: "log";
            search: "search";
            test: "test";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const taskContractSchema: z.ZodObject<{
    intent: z.ZodString;
    goal: z.ZodString;
    acceptanceCriteria: z.ZodArray<z.ZodString>;
    preservationRequirements: z.ZodArray<z.ZodString>;
    constraints: z.ZodArray<z.ZodString>;
    unknowns: z.ZodArray<z.ZodString>;
    explicitPaths: z.ZodArray<z.ZodString>;
    expectedFrontier: z.ZodArray<z.ZodString>;
    requiredProof: z.ZodArray<z.ZodString>;
    size: z.ZodEnum<{
        distributed: "distributed";
        local: "local";
        systemic: "systemic";
        tiny: "tiny";
    }>;
}, z.core.$strip>;
export declare const eventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    version: z.ZodLiteral<1>;
    taskId: z.ZodString;
    repository: z.ZodString;
    timestamp: z.ZodString;
    type: z.ZodLiteral<"task_start">;
    intent: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    version: z.ZodLiteral<1>;
    taskId: z.ZodString;
    repository: z.ZodString;
    timestamp: z.ZodString;
    type: z.ZodLiteral<"task_activity">;
    activity: z.ZodObject<{
        kind: z.ZodEnum<{
            command: "command";
            decision_signal: "decision_signal";
            diff_change: "diff_change";
            file_read: "file_read";
            file_write: "file_write";
            message: "message";
            search: "search";
            test_result: "test_result";
        }>;
        target: z.ZodOptional<z.ZodString>;
        outcome: z.ZodOptional<z.ZodEnum<{
            fail: "fail";
            pass: "pass";
            unknown: "unknown";
        }>>;
        outputBytes: z.ZodDefault<z.ZodNumber>;
        proofRef: z.ZodOptional<z.ZodString>;
        artifactRef: z.ZodOptional<z.ZodString>;
        report: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                approach_rejected: "approach_rejected";
                cause_validated: "cause_validated";
                hypothesis: "hypothesis";
                implementation_selected: "implementation_selected";
                verification: "verification";
            }>;
            summary: z.ZodString;
            constraints: z.ZodDefault<z.ZodArray<z.ZodString>>;
            relevantFiles: z.ZodDefault<z.ZodArray<z.ZodString>>;
            relevantSymbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
            proofRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        toolPayload: z.ZodOptional<z.ZodObject<{
            operation: z.ZodString;
            target: z.ZodOptional<z.ZodString>;
            input: z.ZodString;
            output: z.ZodString;
            status: z.ZodEnum<{
                fail: "fail";
                pass: "pass";
                timeout: "timeout";
                unavailable: "unavailable";
                unknown: "unknown";
            }>;
            semanticDescription: z.ZodOptional<z.ZodString>;
            paths: z.ZodDefault<z.ZodArray<z.ZodString>>;
            symbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
            processor: z.ZodDefault<z.ZodEnum<{
                browser: "browser";
                code: "code";
                diff: "diff";
                json: "json";
                log: "log";
                search: "search";
                test: "test";
            }>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
    version: z.ZodLiteral<1>;
    taskId: z.ZodString;
    repository: z.ZodString;
    timestamp: z.ZodString;
    type: z.ZodLiteral<"lifecycle">;
    phase: z.ZodEnum<{
        post_compact: "post_compact";
        pre_compact: "pre_compact";
    }>;
}, z.core.$strip>, z.ZodObject<{
    version: z.ZodLiteral<1>;
    taskId: z.ZodString;
    repository: z.ZodString;
    timestamp: z.ZodString;
    type: z.ZodLiteral<"before_stop">;
}, z.core.$strip>], "type">;
export type GauntletEvent = z.infer<typeof eventSchema>;
export type TaskActivity = z.infer<typeof activitySchema>;
export type ToolPayload = z.infer<typeof toolPayloadSchema>;
export type StoredTaskActivity = Omit<TaskActivity, "toolPayload">;
export type StateReport = z.infer<typeof stateReportSchema>;
export interface TaskContract extends z.infer<typeof taskContractSchema> {
    size: TaskSize;
}
export interface Finding {
    code: string;
    severity: "info" | "warning" | "error";
    blocking?: boolean;
    message: string;
    proof: string[];
}
