import { translateNativeEvent } from "../shared.js";
const nativeEvents = ["session.created", "tool.execute.after", "tool.execute.error"];
export const opencodeAdapter = {
    name: "opencode", configurationPath: ".opencode/plugin/gauntlet.js", nativeEvents,
    capabilities: {
        skills: { supported: false, dynamicLoad: false }, lifecycle: { taskStart: true, toolActivity: true, failure: true, beforeStop: false },
        tools: { shell: true, mcp: false, browser: false }, delegation: { supported: false, callback: false, modelSelection: false }, telemetry: { tokens: false, cost: false }, environment: { worktrees: false, sandbox: false }, execution: { cancellation: false },
        output: { replacement: "none", preventsInitialContextCost: false }, compaction: { hooks: false },
    },
    translate: (input, name) => translateNativeEvent(input, nativeEvents, name),
};
