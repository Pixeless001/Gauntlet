type ContributionKind = "owner" | "caller" | "dependency" | "interface" | "invariant" | "acceptance" | "contradiction" | "proof";
export type Contribution = ContributionKind | `${ContributionKind}:${string}`;
export interface ContextCandidate<T> {
    value: T;
    contributions: Contribution[];
    cost: number;
}
export declare function selectMarginal<T>(candidates: ContextCandidate<T>[], budget: number): {
    selected: T[];
    rejected: T[];
};
export {};
