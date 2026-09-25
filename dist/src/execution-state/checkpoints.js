export function activePath(checkpoints, activeId) {
    const byId = new Map(checkpoints.map((item) => [item.id, item])), path = [];
    let current = byId.get(activeId), seen = new Set();
    if (!current)
        throw new Error("Active execution checkpoint is missing");
    while (current) {
        if (seen.has(current.id))
            throw new Error("Execution checkpoint cycle");
        seen.add(current.id);
        path.push(current);
        if (current.parentId && !byId.has(current.parentId))
            throw new Error("Execution checkpoint parent is missing");
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path.reverse();
}
export function rejectBranch(checkpoints, activeId, replacement, reason) {
    const current = checkpoints.find((item) => item.id === activeId);
    if (!current)
        throw new Error("Active execution checkpoint is missing");
    const parentId = nearestValidatedParent(checkpoints, current);
    const rejected = checkpoints.map((item) => item.id === activeId ? { ...item, status: "rejected", rejectionReason: reason } : item);
    return [...rejected, { ...replacement, ...(parentId ? { parentId } : {}), status: "active" }];
}
export function rejectedOverlap(checkpoints, target) {
    const terms = keywords(target);
    if (!terms.size)
        return null;
    return checkpoints.find((item) => item.status === "rejected" && overlap(terms, keywords(`${item.summary} ${item.rejectionReason ?? ""}`)) >= 0.5) ?? null;
}
function nearestValidatedParent(checkpoints, checkpoint) {
    const byId = new Map(checkpoints.map((item) => [item.id, item]));
    let current = checkpoint.parentId ? byId.get(checkpoint.parentId) : undefined;
    while (current && current.status !== "validated")
        current = current.parentId ? byId.get(current.parentId) : undefined;
    return current?.id;
}
function keywords(value) {
    return new Set(value.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)?.filter((item) => !["the", "and", "with", "because", "approach", "rejected"].includes(item)) ?? []);
}
function overlap(left, right) {
    return [...left].filter((item) => right.has(item)).length / Math.max(1, Math.min(left.size, right.size));
}
