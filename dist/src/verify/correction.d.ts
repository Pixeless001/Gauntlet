import type { Finding } from "../core/events.js";
import type { UncertaintyKind } from "../control/uncertainty.js";
export interface CorrectionPacket {
    finding: string;
    uncertainty: UncertaintyKind;
    scope: string[];
    proof: string[];
    nextCheck?: string;
}
export declare function correctionPacket(findings: Finding[], scope: string[]): CorrectionPacket | null;
