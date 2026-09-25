import { hookCapabilities, translateNativeEvent } from "../shared.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "PreCompact", "Stop"];
export const claudeCodeAdapter = { name: "claude-code", configurationPath: ".claude/settings.json", nativeEvents, capabilities: hookCapabilities(true, "general"), translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
