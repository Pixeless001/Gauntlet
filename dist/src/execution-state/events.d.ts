export type ExecutionEventType = "file_read" | "file_write" | "search" | "command" | "failure" | "test_result" | "diff_change" | "decision_signal";
export interface ExecutionEvent {
    index: number;
    type: ExecutionEventType;
    target?: string;
    outcome?: string;
    proofRef?: string;
}
