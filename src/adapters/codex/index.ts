import { hookCapabilities, translateNativeEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "PreCompact", "Stop"];
export const codexAdapter: HarnessAdapter = { name: "codex", configurationPath: ".codex/hooks.json", nativeEvents, capabilities: hookCapabilities(false, "feedback"), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
