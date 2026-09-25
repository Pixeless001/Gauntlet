import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
export async function resolvePackageKnowledge(cwd, name, query, providers = {}) {
    if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name))
        throw new Error("Invalid package name");
    const root = resolve(cwd, "node_modules", name), metadata = await json(resolve(root, "package.json"));
    const version = typeof metadata?.version === "string" ? metadata.version : "unknown";
    const cached = await providers.cached?.(name, version, query);
    if (cached)
        return { package: name, version, query, source: "cache", proof: cached };
    const usage = await providers.repositoryUsage?.();
    if (usage)
        return { package: name, version, query, source: "repository_usage", proof: usage };
    for (const candidate of entrypoints(metadata)) {
        const path = within(root, candidate.path);
        if (!path)
            continue;
        try {
            const size = (await stat(path)).size;
            if (size > 256_000)
                continue;
            const content = await readFile(path, "utf8");
            if (matches(content, query))
                return { package: name, version, query, source: candidate.source, proof: `${name}/${candidate.path}` };
        }
        catch { /* unavailable local proof */ }
    }
    if (metadata && matches(Object.keys(metadata).join(" "), query))
        return { package: name, version, query, source: "package_metadata", proof: `${name}/package.json` };
    for (const path of ["README.md", "docs/index.md"])
        try {
            const content = await readFile(resolve(root, path), "utf8");
            if (matches(content, query))
                return { package: name, version, query, source: "local_docs", proof: `${name}/${path}` };
        }
        catch { /* unavailable local documentation */ }
    const external = await providers.externalDocs?.(name, version, query);
    return external ? { package: name, version, query, source: "external_docs", proof: external } : null;
}
function matches(content, query) { return query.toLowerCase().split(/\W+/).filter(Boolean).every((term) => content.toLowerCase().includes(term)); }
async function json(path) { try {
    return JSON.parse(await readFile(path, "utf8"));
}
catch {
    return null;
} }
function entrypoints(metadata) {
    if (!metadata)
        return [];
    const values = [];
    for (const field of ["types", "typings"])
        if (typeof metadata[field] === "string")
            values.push({ path: metadata[field], source: "installed_types" });
    const exports = metadata.exports;
    if (exports && typeof exports === "object")
        collectExports(exports, values);
    for (const field of ["main", "module"])
        if (typeof metadata[field] === "string")
            values.push({ path: metadata[field], source: "installed_source" });
    return values.filter((item, index) => values.findIndex((value) => value.path === item.path) === index);
}
function collectExports(value, output) {
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "string")
            output.push({ path: entry, source: key === "types" || entry.endsWith(".d.ts") ? "installed_types" : "installed_source" });
        else if (entry && typeof entry === "object")
            collectExports(entry, output);
    }
}
function within(root, path) {
    const target = resolve(root, path), remainder = relative(root, target);
    return remainder && !remainder.startsWith("..") && !isAbsolute(remainder) ? target : null;
}
