import type { Finding } from "../core/events.js";

export interface CorrectionPacket { finding: string; scope: string[]; evidence: string[]; nextCheck?: string }
export function correctionPacket(findings: Finding[], scope: string[]): CorrectionPacket | null {
  const finding = findings.find((item) => item.blocking); if (!finding) return null;
  return { finding: finding.message, scope: scope.slice(0, 8), evidence: finding.evidence.slice(0, 4), ...(finding.evidence[0] ? { nextCheck: `Re-run the check supporting ${finding.evidence[0]}` } : {}) };
}
