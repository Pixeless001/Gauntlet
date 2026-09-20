import type { BrowserProof } from "../providers/types.js";

export interface CompactBrowserProof { text: string[]; controls: { role: string; name: string }[]; screenshot?: string; failures: string[] }
export function compactBrowserProof(proof: BrowserProof, limit = 20): CompactBrowserProof {
  return { text: unique(proof.text).slice(0, limit), controls: proof.controls.filter((item, index, values) => values.findIndex((value) => value.role === item.role && value.name === item.name) === index).slice(0, limit), ...(proof.screenshot ? { screenshot: proof.screenshot } : {}), failures: unique([...proof.consoleFailures, ...proof.networkFailures]).slice(0, limit) };
}
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
