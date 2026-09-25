import type { BrowserProof } from "../providers/types.js";
export interface CompactBrowserProof {
    text: string[];
    controls: {
        role: string;
        name: string;
    }[];
    screenshot?: string;
    failures: string[];
}
export declare function compactBrowserProof(proof: BrowserProof, limit?: number): CompactBrowserProof;
