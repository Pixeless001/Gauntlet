import type { Finding } from "../core/events.js";
import type { UncertaintyKind } from "../control/uncertainty.js";

export interface CorrectionPacket { finding: string; uncertainty: UncertaintyKind; scope: string[]; evidence: string[]; nextCheck?: string }
export function correctionPacket(findings: Finding[], scope: string[]): CorrectionPacket | null {
  const finding = findings.find((item) => item.blocking); if (!finding) return null;
  return { finding: finding.message, uncertainty: uncertaintyFor(finding.code), scope: [...new Set([...finding.evidence.filter((item) => /[/.]/.test(item)).map((item) => item.split(":")[0]!), ...scope])].slice(0, 8), evidence: finding.evidence.slice(0, 4), ...(finding.evidence[0] ? { nextCheck: `Re-run the check supporting ${finding.evidence[0]}` } : {}) };
}

function uncertaintyFor(code: string): UncertaintyKind {
  if (code === "weak-counterfactual" || code.includes("test")) return "behavior";
  if (code.includes("architecture") || code.includes("convention") || code.includes("dependency")) return "repoFit";
  if (code.includes("scope")) return "scope";
  return "regression";
}
