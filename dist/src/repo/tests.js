import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
export async function walk(cwd, limit = 10_000) {
    const output = [], queue = [""];
    while (queue.length && output.length < limit) {
        const relative = queue.shift();
        let entries;
        try {
            entries = await readdir(join(cwd, relative), { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if ([".git", "node_modules", "dist", ".gauntlet"].includes(entry.name))
                continue;
            const path = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory())
                queue.push(path);
            else
                output.push(path);
        }
    }
    return output;
}
export async function countSkippedTests(cwd) {
    const files = (await walk(cwd)).filter((file) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(file));
    let count = 0;
    for (const file of files) {
        const text = await readFile(join(cwd, file), "utf8");
        count += (text.match(/\b(?:it|test|describe)\.(?:skip|todo)\b/g) ?? []).length;
    }
    return count;
}
export async function captureTestSignatures(cwd, files) {
    const result = {};
    const candidates = files ?? await walk(cwd);
    for (const file of candidates.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path))) {
        let text;
        try {
            text = await readFile(join(cwd, file), "utf8");
        }
        catch {
            continue;
        }
        result[file] = {
            assertions: text.split("\n").map((line) => line.trim().replace(/\s+/g, " ")).filter((line) => /\bexpect\s*\(|\bassert(?:\.|\s*\()/.test(line)),
            skipped: (text.match(/\b(?:it|test|describe)\.(?:skip|todo)\b/g) ?? []).length,
        };
    }
    return result;
}
