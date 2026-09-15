export type CapabilityKind = "search" | "output" | "execution" | "docs" | "browser" | "delegation" | "registry" | "reference" | "skill";
export type CapabilitySource = "repository" | "host" | "installed" | "gauntlet";
export interface Capability<T = unknown> { id: string; kind: CapabilityKind; source: CapabilitySource; available: boolean; value: () => T; version?: string }

export class CapabilityRegistry {
  private readonly entries = new Map<CapabilityKind, Capability[]>();
  register<T>(capability: Capability<T>): void { const values = this.entries.get(capability.kind) ?? []; this.entries.set(capability.kind, [...values.filter((item) => item.id !== capability.id), capability]); }
  candidates<T>(kind: CapabilityKind): Capability<T>[] { return (this.entries.get(kind) ?? []) as Capability<T>[]; }
}
