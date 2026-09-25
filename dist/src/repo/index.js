import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./process.js";
import { walk } from "./tests.js";
const testPattern = /(?:test|spec)\.[cm]?[jt]sx?$/;
const configs = new Set(["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "tsconfig.json", "pyproject.toml", "Cargo.toml", "Cargo.lock", "go.mod", "Gemfile"]);
const git = (cwd, args) => run("git", args, cwd, 15_000, 8_000_000);
const fields = (value) => value.split("\0").filter(Boolean);
const external = (path) => path !== ".gauntlet" && !path.startsWith(".gauntlet/");
export async function fingerprintFiles(cwd, paths) {
    const result = {};
    for (let offset = 0; offset < paths.length; offset += 32) {
        await Promise.all(paths.slice(offset, offset + 32).map(async (path) => {
            try {
                const content = await readFile(join(cwd, path));
                const lines = content.byteLength <= 2_000_000 && !content.includes(0) ? content.toString("utf8").split("\n") : [];
                result[path] = { hash: createHash("sha256").update(content).digest("hex"), lineHashes: lines.map((line) => createHash("sha256").update(line).digest("base64url").slice(0, 12)) };
            }
            catch { /* file vanished */ }
        }));
    }
    return result;
}
export function parseStatus(output) {
    const entries = fields(output), paths = [];
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (entry.length < 4)
            continue;
        paths.push(entry.slice(3));
        if ((entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C") && entries[index + 1])
            paths.push(entries[++index]);
    }
    return [...new Set(paths)].filter(external).sort();
}
export async function createRepoIndex(cwd) {
    const head = await git(cwd, ["rev-parse", "HEAD"]);
    if (head.exitCode === 0) {
        const [tracked, untracked, status] = await Promise.all([
            git(cwd, ["ls-files", "-z"]),
            git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
            git(cwd, ["status", "--porcelain=v1", "-z"]),
        ]);
        const files = [...new Set([...fields(tracked.stdout), ...fields(untracked.stdout)])].filter(external).sort().slice(0, 10_000);
        const dirty = parseStatus(status.stdout);
        return classify({ mode: "git", head: head.stdout.trim(), files, dirty, fingerprints: await fingerprintFiles(cwd, dirty) });
    }
    const files = (await walk(cwd)).sort();
    return classify({ mode: "filesystem", head: null, files, dirty: files, fingerprints: await fingerprintFiles(cwd, files) });
}
function classify(index) {
    return { ...index, tests: index.files.filter((path) => testPattern.test(path)), configs: index.files.filter((path) => configs.has(path) || configs.has(path.split("/").at(-1))) };
}
