const precedence = { repository: 0, host: 1, installed: 2, gauntlet: 3 };
export class CapabilityResolver {
    registry;
    overrides;
    constructor(registry, overrides = {}) {
        this.registry = registry;
        this.overrides = overrides;
    }
    resolve(kind) {
        const available = this.registry.candidates(kind).filter((item) => item.available), override = this.overrides[kind];
        const capability = override ? available.find((item) => item.id === override) ?? null : available.sort((a, b) => precedence[a.source] - precedence[b.source])[0] ?? null;
        return { capability, conflicts: available.filter((item) => item !== capability).map((item) => item.id) };
    }
}
