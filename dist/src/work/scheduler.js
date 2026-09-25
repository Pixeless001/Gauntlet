export function scheduleReady(nodes, capabilities) {
    const localLimit = capabilities.maxLocal ?? 4, workerLimit = capabilities.maxWorkers ?? 1;
    const selected = [], claimed = new Set();
    let workers = 0, mutationSelected = false;
    for (const node of nodes.filter((node) => node.state === "READY").sort((left, right) => rank(left, right, capabilities.openUncertainties ?? [], nodes))) {
        if (node.executor === "worker" && workers >= workerLimit)
            continue;
        const mutation = node.writePaths.length > 0;
        if (mutation && (mutationSelected && !capabilities.isolatedMutation || node.writePaths.some((path) => claimed.has(path))))
            continue;
        if (!mutation && selected.filter((item) => !item.writePaths.length).length >= localLimit)
            continue;
        selected.push(node);
        if (node.executor === "worker")
            workers += 1;
        if (mutation)
            mutationSelected = true;
        for (const path of node.writePaths)
            claimed.add(path);
    }
    return selected;
}
function rank(left, right, openUncertainties, nodes) {
    return Number(right.required) - Number(left.required)
        || right.criticalPath - left.criticalPath
        || resolvedCount(right, openUncertainties) - resolvedCount(left, openUncertainties)
        || unlockedCount(right, nodes) - unlockedCount(left, nodes)
        || verificationRank(left) - verificationRank(right)
        || left.id.localeCompare(right.id);
}
function verificationRank(node) { return node.kind === "verification" ? -1 : node.required ? 0 : 1; }
function resolvedCount(node, open) { return node.resolves.filter((kind) => open.includes(kind)).length; }
function unlockedCount(node, nodes) { return nodes.filter((child) => child.required && child.dependencies.includes(node.id)).length; }
