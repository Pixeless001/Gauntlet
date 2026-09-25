import type { Finding } from "../core/events.js";
export interface CommitRule {
    source: string;
    text: string;
    terms: string[];
}
/** Negative instructions about commits that name concrete terms, e.g. "Never add `X` to commits". */
export declare function commitRules(source: string, content: string): CommitRule[];
/** Warns when task commits start a line with a term the repository's own instructions forbid in commits. */
export declare function inspectCommitRules(cwd: string, head: string | null): Promise<Finding[]>;
