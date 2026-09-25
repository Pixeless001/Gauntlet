import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
export async function findRelationships(cwd, targets, files, maxFiles = 80, maxBytes = 128_000) {
    const known = new Set(files), values = new Map();
    let bytes = 0;
    const candidates = [...new Set([...targets, ...files.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path)), ...files.filter((path) => /\.[cm]?[jt]sx?$/.test(path)).slice(0, maxFiles)])].slice(0, maxFiles);
    for (const path of candidates) {
        if (bytes >= maxBytes)
            break;
        let content;
        try {
            const size = (await stat(join(cwd, path))).size;
            if (size > maxBytes - bytes)
                continue;
            content = await readFile(join(cwd, path), "utf8");
            bytes += size;
        }
        catch {
            continue;
        }
        if (targets.includes(path)) {
            for (const specifier of imports(content)) {
                const resolved = resolveImport(path, specifier, known);
                if (resolved && !targets.includes(resolved))
                    values.set(resolved, { path: resolved, reason: `imported by ${path}`, score: 16 });
            }
            continue;
        }
        const target = targets.find((item) => references(content, path, item));
        if (target)
            values.set(path, { path, reason: /(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ? `tests ${target}` : `references ${target}`, score: /(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ? 15 : 13 });
    }
    return [...values.values()];
}
function imports(content) {
    return [...content.matchAll(/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g)].map((match) => match[1]);
}
function resolveImport(from, specifier, known) {
    if (!specifier.startsWith("."))
        return null;
    const base = normalize(join(dirname(from), specifier)).replaceAll("\\", "/"), sourceBase = base.replace(/\.[cm]?js$/, ""), choices = [base, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"].map((extension) => sourceBase + extension), ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${sourceBase}/index${extension}`)];
    return choices.find((path) => known.has(path)) ?? null;
}
function references(content, path, target) {
    const stem = target.slice(0, -extname(target).length), name = stem.split("/").at(-1);
    return content.includes(stem) || content.includes(`/${name}`) || (/(?:test|spec)\.[cm]?[jt]sx?$/.test(path) && path.includes(name));
}
