export type AuditStatus = "implemented" | "partial" | "missing";
export interface ArchitectureAuditItem {
    id: string;
    capability: string;
    acceptance: string;
    mandatory: boolean;
    status: AuditStatus;
    implementation: string[];
    tests: string[];
    gap?: string;
}
export interface ArchitectureAuditSummary {
    implemented: number;
    partial: number;
    missing: number;
    total: number;
    mandatory: number;
    blocking: string[];
    releaseReady: boolean;
}
export declare const ARCHITECTURE_AUDIT: readonly ArchitectureAuditItem[];
export declare function summarizeArchitectureAudit(items?: readonly ArchitectureAuditItem[]): ArchitectureAuditSummary;
export interface AuditProofIssue {
    id: string;
    kind: "implementation" | "test";
    proof: string;
    reason: "unsafe" | "missing" | "unverified";
}
export declare function validateAuditProof(cwd: string, items?: readonly ArchitectureAuditItem[]): Promise<AuditProofIssue[]>;
