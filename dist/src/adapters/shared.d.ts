import { type GauntletEvent } from "../core/events.js";
import type { HarnessCapabilities } from "./types.js";
export declare const hookCapabilities: (failure: boolean, replacement: HarnessCapabilities["output"]["replacement"]) => HarnessCapabilities;
export declare function translateNativeEvent(input: unknown, nativeEvents: string[], explicitName?: string): GauntletEvent;
