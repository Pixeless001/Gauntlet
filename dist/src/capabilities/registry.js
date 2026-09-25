export class CapabilityRegistry {
    entries = new Map();
    register(capability) { const values = this.entries.get(capability.kind) ?? []; this.entries.set(capability.kind, [...values.filter((item) => item.id !== capability.id), capability]); }
    candidates(kind) { return (this.entries.get(kind) ?? []); }
    all() { return [...this.entries.values()].flat(); }
}
