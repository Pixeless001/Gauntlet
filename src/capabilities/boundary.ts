const active = new Map<string, number>();

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
export async function runCapabilityBoundary<T>(input: CapabilityBoundaryInput<T>): Promise<CapabilityBoundaryResult<T>> {
  const request = redact(input.request), count = active.get(input.source) ?? 0, limit = input.maxConcurrency ?? 2;
  if (count >= limit) return { status: "unavailable", source: input.source, request, reason: "concurrency limit reached" };
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000); active.set(input.source, count + 1);
  try {
    const result = await input.run(request, controller.signal);
    return { status: "ok", source: input.source, request, result: typeof result === "string" ? redact(result) as T : result };
  } catch (error) {
    return { status: "unavailable", source: input.source, request, reason: controller.signal.aborted ? "deadline exceeded" : error instanceof Error ? error.message : "capability unavailable" };
  } finally {
    clearTimeout(timeout); const remaining = (active.get(input.source) ?? 1) - 1; if (remaining) active.set(input.source, remaining); else active.delete(input.source);
  }
}

function redact(value: string): string {
  return value.replace(/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_\-]{8,}\b/g, "[redacted]").replace(/\b(authorization|token|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}
