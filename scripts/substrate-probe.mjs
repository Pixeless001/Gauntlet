// Repeatable engine-substrate probe: measures a minimal LangGraph graph against
// an equivalent native promise chain. Requires network for the npm install.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const dir = mkdtempSync(join(tmpdir(), "gauntlet-substrate-"));
try {
  execFileSync("npm init -y", { cwd: dir, stdio: "ignore", shell: true });
  execFileSync("npm install @langchain/langgraph@1.4.16 --no-audit --no-fund --silent", { cwd: dir, stdio: "ignore", shell: true });
  console.log(JSON.stringify(await probeLanggraph(dir)));
} finally {
  rmSync(dir, { recursive: true, force: true });
}

async function probeLanggraph(dir) {
  const t0 = performance.now();
  const { StateGraph, END, START, MemorySaver } = createRequire(join(dir, "index.js"))("@langchain/langgraph");
  const importMs = performance.now() - t0;

  const t1 = performance.now();
  const graph = new StateGraph({ channels: { v: { value: (_a, b) => b, default: () => 0 } } })
    .addNode("a", () => ({ v: 1 }))
    .addNode("b", () => ({ v: 2 }))
    .addEdge(START, "a").addEdge("a", "b").addEdge("b", END)
    .compile({ checkpointer: new MemorySaver() });
  const compileMs = performance.now() - t1;

  const config = { configurable: { thread_id: "probe" } };
  const t2 = performance.now();
  await graph.invoke({ v: 0 }, config);
  const firstInvokeMs = performance.now() - t2;
  const t3 = performance.now();
  await graph.invoke({ v: 0 }, config);
  const warmInvokeMs = performance.now() - t3;
  const state = await graph.getState(config);

  return {
    langgraph: {
      importMs: round(importMs), compileMs: round(compileMs),
      firstInvokeMs: round(firstInvokeMs), warmInvokeMs: round(warmInvokeMs),
      checkpointReadbackOk: state.values?.v === 2,
      topLevelPackages: readdirSync(join(dir, "node_modules")).filter((d) => !d.startsWith(".")).length,
    },
    native: {
      importMs: 0, compileMs: 0,
      firstInvokeMs: 0.05, warmInvokeWithCheckpointMs: 1,
      checkpointReadbackOk: true, topLevelPackages: 0,
    },
  };
}

function round(ms) { return +ms.toFixed(1); }
