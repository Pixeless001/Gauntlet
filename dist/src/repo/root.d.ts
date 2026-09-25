/** Hosts report the shell's cwd, which may be a subdirectory; git paths and `.gauntlet` state are repo-root relative. */
export declare function repositoryRoot(cwd: string): string;
