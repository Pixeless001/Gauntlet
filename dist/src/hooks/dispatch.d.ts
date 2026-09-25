import type { HarnessName } from "../adapters/types.js";
type NativeEvent = Record<string, unknown>;
export declare function dispatchHook(harness: HarnessName, input: NativeEvent, nativeEvent?: string): Promise<NativeEvent>;
export declare function runHook(harness: HarnessName, nativeEvent?: string): Promise<void>;
export declare function harnessForEvent(name: string): HarnessName;
export declare function runAutoHook(nativeEvent?: string): Promise<void>;
export {};
