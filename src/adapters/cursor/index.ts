import { translateEvent } from "../shared.js";
import type { HarnessAdapter } from "../types.js";
export const cursorAdapter: HarnessAdapter = { name: "cursor", configurationPath: ".cursor/hooks.json", nativeEvents: ["sessionStart", "beforeSubmitPrompt", "postToolUse", "postToolUseFailure", "stop"], translate: translateEvent };
