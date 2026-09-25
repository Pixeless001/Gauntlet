export function graphExpansionCandidate(uncertainty, available) {
    const resolves = ["location", "repoFit", "regression"].filter((kind) => uncertainty[kind] === "open" || uncertainty[kind] === "partial");
    return resolves.length ? { id: "graph:working-impact", kind: "graph-expansion", uncertainty: resolves[0], resolves: [...resolves], level: 2, cost: "low", authority: "repository", source: "structural-index", reason: "Resolve ownership, repository fit, or regression impact from the bounded working graph", available } : null;
}
export function workingGraph(index, seeds, maxNodes = 24, maxDepth = 2) {
    const output = [], seen = new Set(), queue = [...new Set(seeds)].map((path) => ({ path, reason: "task seed", depth: 0 }));
    while (queue.length && output.length < maxNodes) {
        const current = queue.shift();
        if (seen.has(current.path))
            continue;
        seen.add(current.path);
        output.push(current);
        if (current.depth >= maxDepth)
            continue;
        for (const path of index.files[current.path]?.imports ?? [])
            queue.push({ path, reason: `imported by ${current.path}`, depth: current.depth + 1 });
        for (const path of index.dependents[current.path] ?? [])
            queue.push({ path, reason: `depends on ${current.path}`, depth: current.depth + 1 });
        for (const path of index.files[current.path]?.tests ?? [])
            queue.push({ path, reason: `tests ${current.path}`, depth: current.depth + 1 });
    }
    return output;
}
export function ensureDepth(index, seeds, depth, maxNodes = 24) {
    const numericDepth = depth === "file" ? 0 : depth === "symbol" ? 1 : 2, nodes = workingGraph(index, seeds, maxNodes, numericDepth);
    const included = new Set(nodes.map((node) => node.path)), symbols = depth === "file" ? [] : [...new Set(nodes.flatMap((node) => index.files[node.path]?.symbols ?? []))];
    const relations = depth !== "relation" ? [] : nodes.flatMap((node) => {
        const file = index.files[node.path];
        if (!file)
            return [];
        return [...file.imports.filter((to) => included.has(to)).map((to) => ({ from: node.path, to, kind: "imports" })), ...(index.dependents[node.path] ?? []).filter((to) => included.has(to)).map((to) => ({ from: node.path, to, kind: "dependent" })), ...file.tests.filter((to) => included.has(to)).map((to) => ({ from: node.path, to, kind: "test" }))];
    });
    return { nodes, symbols, relations, truncated: nodes.length >= maxNodes };
}
export function inspectImpact(index, target, limit = 80) {
    const cone = impact(index, target, limit), file = index.files[target];
    return { target, owner: file?.packageRoot ?? null, dependencies: file?.imports.slice(0, limit) ?? [], callers: cone.transitiveDependents, tests: cone.affectedTests, packageCrossings: cone.packageCrossings, publicSurface: cone.publicSurface, confidence: cone.confidence, truncated: cone.truncated };
}
export function impact(index, target, limit = 80) {
    const directDependents = (index.dependents[target] ?? []).slice(0, limit), queue = [...directDependents], seen = new Set();
    while (queue.length && seen.size < limit) {
        const path = queue.shift();
        if (seen.has(path))
            continue;
        seen.add(path);
        queue.push(...(index.dependents[path] ?? []));
    }
    const transitiveDependents = [...seen], affectedTests = [...new Set([...(index.files[target]?.tests ?? []), ...transitiveDependents.flatMap((path) => index.files[path]?.tests ?? []), ...transitiveDependents.filter((path) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(path))])];
    const owner = index.files[target]?.packageRoot, packageCrossings = transitiveDependents.filter((path) => index.files[path]?.packageRoot !== owner);
    const available = Boolean(index.files[target]), truncated = queue.length > 0 || (index.dependents[target]?.length ?? 0) > limit;
    return { target, directDependents, transitiveDependents, affectedTests, packageCrossings, publicSurface: (index.files[target]?.exports.length ?? 0) > 0, confidence: !available ? "low" : truncated ? "medium" : "high", truncated };
}
