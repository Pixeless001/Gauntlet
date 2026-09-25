export interface SubstrateDimension {
    native: string;
    langgraphPrototype: string;
}
export declare const LANGGRAPH_PROBE: {
    readonly package: "@langchain/langgraph";
    readonly version: "1.4.16";
    readonly transition: 2;
    readonly checkpoint: 2;
    readonly dependencyDirectories: 16;
    readonly temporary: true;
    readonly retained: true;
};
export declare const SUBSTRATE_MEASUREMENTS: {
    readonly recordedAt: "2026-09-21";
    readonly reproduce: "npm run substrate:probe";
    readonly native: {
        readonly importMs: 0;
        readonly firstInvokeMs: 0.05;
        readonly warmInvokeWithCheckpointMs: 1.1;
        readonly dependencyDirs: 0;
        readonly nodeModulesMB: 0;
    };
    readonly langgraph: {
        readonly importMs: 819.5;
        readonly compileMs: 3.1;
        readonly firstInvokeMs: 30.7;
        readonly warmInvokeMs: 19.6;
        readonly checkpointReadbackOk: true;
        readonly dependencyDirs: 15;
        readonly nodeModulesMB: 59;
    };
};
export declare const SUBSTRATE_COMPARISON: Record<string, SubstrateDimension>;
export declare function substrateProof(): string[];
