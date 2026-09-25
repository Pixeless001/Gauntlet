import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
/** Hosts report the shell's cwd, which may be a subdirectory; git paths and `.gauntlet` state are repo-root relative. */
export function repositoryRoot(cwd) {
    try {
        return resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 }).trim());
    }
    catch {
        return cwd;
    }
}
