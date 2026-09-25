import { hookCapabilities, translateNativeEvent } from "../shared.js";
const nativeEvents = ["sessionStart", "beforeSubmitPrompt", "postToolUse", "postToolUseFailure", "preCompact", "stop"];
export const cursorAdapter = { name: "cursor", configurationPath: ".cursor/hooks.json", nativeEvents, capabilities: hookCapabilities(true, "mcp"), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
