import { translateEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
export const claudeCodeAdapter: HarnessAdapter = { name: "claude-code", configurationPath: ".claude/settings.json", nativeEvents: ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop"], translate: translateEvent };
