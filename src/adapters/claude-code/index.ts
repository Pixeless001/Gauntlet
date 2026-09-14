import { translateNativeEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop"];
export const claudeCodeAdapter: HarnessAdapter = { name: "claude-code", configurationPath: ".claude/settings.json", nativeEvents, translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
