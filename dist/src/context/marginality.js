export function selectMarginal(candidates, budget) {
    const known = new Set(), selected = [], rejected = [];
    let used = 0;
    for (const candidate of candidates) {
        const adds = candidate.contributions.some((value) => !known.has(value));
        if (!adds || used + candidate.cost > budget) {
            rejected.push(candidate.value);
            continue;
        }
        selected.push(candidate.value);
        used += candidate.cost;
        for (const value of candidate.contributions)
            known.add(value);
    }
    return { selected, rejected };
}
