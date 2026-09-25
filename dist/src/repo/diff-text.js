import { readFile } from "node:fs/promises";
import { run } from "./process.js";
export async function captureAddedLines(cwd, base) {
    const [tracked, untracked] = await Promise.all([
        run("git", ["diff", "-U0", base], cwd, 15_000, 8_000_000),
        run("git", ["ls-files", "--others", "--exclude-standard"], cwd, 15_000, 1_000_000),
    ]);
    const added = parseAddedLines(tracked.stdout);
    for (const path of untracked.stdout.trim().split("\n").filter(Boolean)) {
        if (path.startsWith(".gauntlet/"))
            continue;
        try {
            added[path] = (await readFile(`${cwd}/${path}`, "utf8")).split("\n");
        }
        catch { /* unreadable file */ }
    }
    return added;
}
export function parseAddedLines(diff) {
    const added = {};
    let current = null;
    for (const line of diff.split("\n")) {
        const file = line.match(/^\+\+\+ b\/(.+)$/);
        if (file?.[1]) {
            current = file[1];
            continue;
        }
        if (line.startsWith("diff --git"))
            current = null;
        if (current && line.startsWith("+"))
            (added[current] ??= []).push(line.slice(1));
    }
    return added;
}
