import { translateEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
export const codexAdapter: HarnessAdapter = { name: "codex", configurationPath: ".codex/hooks.json", nativeEvents: ["UserPromptSubmit", "PostToolUse", "Stop"], translate: translateEvent };
