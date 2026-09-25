import type { Finding } from "../core/events.js";
/** Flags task commits whose messages carry attribution the repository's own instructions forbid. */
export declare function inspectCommitRules(cwd: string, head: string | null): Promise<Finding[]>;
