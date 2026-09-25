import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../repo/process.js";
export async function verifyIsolatedPatch(cwd, base, patch) {
    const root = await mkdtemp(join(tmpdir(), "gauntlet-promotion-")), worktree = join(root, "checkout"), patchPath = join(root, "candidate.patch");
    let created = false;
    try {
        await writeFile(patchPath, patch, { mode: 0o600 });
        if ((await run("git", ["worktree", "add", "--detach", worktree, base], cwd)).exitCode !== 0)
            return false;
        created = true;
        if ((await run("git", ["apply", "--check", patchPath], worktree)).exitCode !== 0)
            return false;
        if ((await run("git", ["apply", patchPath], worktree)).exitCode !== 0)
            return false;
        return (await run("git", ["diff", "--check"], worktree)).exitCode === 0;
    }
    finally {
        if (created)
            await run("git", ["worktree", "remove", "--force", worktree], cwd);
        await rm(root, { recursive: true, force: true });
    }
}
