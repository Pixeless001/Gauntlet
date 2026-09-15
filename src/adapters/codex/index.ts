import { translateNativeEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
const nativeEvents = ["UserPromptSubmit", "PostToolUse", "Stop"];
export const codexAdapter: HarnessAdapter = { name: "codex", configurationPath: ".codex/hooks.json", nativeEvents, translate: (input, name) => translateNativeEvent(input, nativeEvents, name) };
