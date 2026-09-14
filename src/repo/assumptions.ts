import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RepoIndex } from "./index.js";

export type EvidenceKind = "repository-usage" | "installed-types" | "package-version" | "local-docs" | "external-required";
export interface Assumption { packageName: string; symbol?: string }
export interface AssumptionResolution { assumption: Assumption; resolved: boolean; kind: EvidenceKind; evidence: string[]; fingerprint?: string }

export async function resolveAssumption(cwd: string, assumption: Assumption, index: RepoIndex, maxFiles = 40, maxBytes = 64_000): Promise<AssumptionResolution> {
  const escaped = assumption.packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), usage = new RegExp(`(?:from\\s+|require\\(\\s*)["']${escaped}(?:[/"']|$)`); let bytes = 0;
  for (const path of index.files.filter((item) => /\.[cm]?[jt]sx?$/.test(item)).slice(0, maxFiles)) {
    try { const content = await readFile(join(cwd, path), "utf8"); bytes += Buffer.byteLength(content); if (bytes > maxBytes) break; if (usage.test(content) && (!assumption.symbol || content.includes(assumption.symbol))) return resolution(assumption, "repository-usage", path, content); } catch { /* unavailable candidate */ }
  }
  for (const path of [`node_modules/${assumption.packageName}/package.json`, `node_modules/${assumption.packageName}/index.d.ts`]) {
    try { const content = await readFile(join(cwd, path), "utf8"); if (!assumption.symbol || content.includes(assumption.symbol)) return resolution(assumption, path.endsWith(".d.ts") ? "installed-types" : "package-version", path, content); } catch { /* try cheaper fallback */ }
  }
  return { assumption, resolved: false, kind: "external-required", evidence: [] };
}

function resolution(assumption: Assumption, kind: EvidenceKind, path: string, content: string): AssumptionResolution {
  return { assumption, resolved: true, kind, evidence: [path], fingerprint: createHash("sha256").update(content).digest("hex") };
}
