import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
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
