/** Picks the sections of an instruction file that bear on this task instead of a blind prefix, so rules late in the file (git, commits) still arrive. */
export declare function selectInstructionSections(content: string, intent: string, limit?: number): string;
