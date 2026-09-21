import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StateStore } from "../src/state/store.js";
import { GraphEventStore } from "../src/work/event-store.js";
import { taskState } from "./support.js";

test("state recovery resumes the atomically checkpointed graph world after a snapshot crash", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-recovery-"));
  try {
    const store = new StateStore(cwd), state = taskState("Change source.ts"); state.repository = cwd; await store.saveTask(state);
    const eventStore = new GraphEventStore(cwd), world = { ...state.world, revision: 2 };
    await eventStore.append("task", { at: new Date().toISOString(), type: "NODE_CREATED", nodeId: "implementation" }, world);
    const recovered = await store.loadTask("task");
    assert.equal(recovered.world.revision, 2); assert.equal(recovered.world.appliedEvent, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("state recovery replays the last persisted event when its checkpoint was not written", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-event-replay-"));
  try {
    const store = new StateStore(cwd), state = taskState("Change source.ts"); state.repository = cwd; await store.saveTask(state);
    const eventStore = new GraphEventStore(cwd), world = { ...state.world, revision: 3 };
    await eventStore.append("task", { at: new Date().toISOString(), type: "NODE_CREATED", nodeId: "implementation" }, world);
    await rm(join(cwd, ".gauntlet", "sessions", "task", "world.json"));
    const recovered = await store.loadTask("task");
    assert.equal(recovered.world.revision, 3); assert.equal(recovered.world.appliedEvent, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("event history stores replay patches instead of repeating complete worlds", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gauntlet-event-patches-"));
  try {
    const events = new GraphEventStore(cwd), state = taskState("Change source.ts");
    await events.append("task", { at: new Date().toISOString(), type: "NODE_CREATED", nodeId: "implementation" }, state.world);
    const changed = { ...state.world, revision: 7 };
    await events.append("task", { at: new Date().toISOString(), type: "NODE_READY", nodeId: "implementation" }, changed);
    const history = (await readFile(join(cwd, ".gauntlet", "sessions", "task", "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal("world" in history[1], false); assert.deepEqual(history[1].patch, [{ path: ["revision"], value: 7 }, { path: ["appliedEvent"], value: 2 }]);
    await rm(join(cwd, ".gauntlet", "sessions", "task", "world.json"));
    assert.equal((await events.resume("task"))?.world.revision, 7);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
