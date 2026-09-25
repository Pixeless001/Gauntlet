export interface CapabilityBoundaryInput<T> {
    source: string;
    request: string;
    run: (request: string, signal: AbortSignal) => Promise<T>;
    timeoutMs?: number;
    maxConcurrency?: number;
}
export interface CapabilityBoundaryResult<T> {
    status: "ok" | "unavailable";
    source: string;
    request: string;
    result?: T;
    reason?: string;
}
/** Bound optional external work so failure becomes a local no-action result. */
export declare function runCapabilityBoundary<T>(input: CapabilityBoundaryInput<T>): Promise<CapabilityBoundaryResult<T>>;
