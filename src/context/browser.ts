import type { BrowserEvidence } from "../providers/types.js";

export interface CompactBrowserEvidence { text: string[]; controls: { role: string; name: string }[]; screenshot?: string; failures: string[] }
export function compactBrowserEvidence(evidence: BrowserEvidence, limit = 20): CompactBrowserEvidence {
  return { text: unique(evidence.text).slice(0, limit), controls: evidence.controls.filter((item, index, values) => values.findIndex((value) => value.role === item.role && value.name === item.name) === index).slice(0, limit), ...(evidence.screenshot ? { screenshot: evidence.screenshot } : {}), failures: unique([...evidence.consoleFailures, ...evidence.networkFailures]).slice(0, limit) };
}
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
