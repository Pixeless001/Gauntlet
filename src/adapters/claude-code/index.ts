import { hookCapabilities, translateNativeEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop"];
export const claudeCodeAdapter: HarnessAdapter = { name: "claude-code", configurationPath: ".claude/settings.json", nativeEvents, capabilities: hookCapabilities(true), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
