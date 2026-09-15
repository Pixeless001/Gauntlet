import { hookCapabilities, translateNativeEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
const nativeEvents = ["sessionStart", "beforeSubmitPrompt", "postToolUse", "postToolUseFailure", "stop"];
export const cursorAdapter: HarnessAdapter = { name: "cursor", configurationPath: ".cursor/hooks.json", nativeEvents, capabilities: hookCapabilities(true), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
