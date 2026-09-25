import { hookCapabilities, translateNativeEvent } from "../shared.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "PreCompact", "Stop"];
export const codexAdapter = { name: "codex", configurationPath: ".codex/hooks.json", nativeEvents, capabilities: hookCapabilities(false, "feedback"), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
