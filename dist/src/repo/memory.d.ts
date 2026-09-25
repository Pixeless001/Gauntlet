import type { RepoProfile } from "./detect.js";
export interface RepositoryFact {
    key: string;
    value: string;
    proof: string[];
    fingerprint: string;
}
export declare function deriveFacts(cwd: string, profile: RepoProfile): Promise<RepositoryFact[]>;
export declare function validFact(fact: RepositoryFact, currentFingerprint: string): boolean;
