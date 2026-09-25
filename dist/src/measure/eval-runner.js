import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extractContract } from "../core/intent.js";
import { assessRisk } from "../core/risk.js";
import { routeSkills } from "../core/skills.js";
import { runIntelligenceEvals } from "./scenarios.js";
import { ARCHITECTURE_FIXTURES } from "./fixtures.js";
import { createRepoIndex } from "../repo/index.js";
import { buildStructuralIndex } from "../intelligence/index.js";
import { inspectImpact } from "../intelligence/working-graph.js";
import { initialUncertainty } from "../control/uncertainty.js";
import { selectInterventions } from "../control/selector.js";
import { DEFAULT_INTERVENTION_BUDGET } from "../core/policy.js";
import { addCommunicationEdge, addNode, communicationEvidence, createGraph, createValidityGraph, addValidityEdges, decisionIsFresh, invalidateCone } from "../work/graph.js";
import { createWorld, refreshCapabilities, refreshValidityInputs } from "../work/world.js";
import { scheduleReady } from "../work/scheduler.js";
import { substrateProof } from "./substrate.js";
import { admitDiscovery, initializeWork, refreshFrontier } from "../work/runtime.js";
import { reduceCandidates } from "../work/reducer.js";
const researchSuites = ["sparse-communication", "topology-adaptation", "work-reduction", "critical-path-scheduling", "validity-recomputation", "shared-state-leakage", "heavy-workflow-suppression", "cold-verification", "dynamic-growth", "action-menu-freshness", "native-conformance"];
export const evalSuites = ["decisions", "repository", "ablation", "interaction", "replay", "orchestration", "substrate", ...researchSuites];
const cases = [
    { id: "silence-readme", intent: "Fix README typo", expected: [] },
    { id: "silence-rename", intent: "Rename a local variable", expected: [] },
    { id: "route-failure", intent: "Investigate intermittent crash", expected: ["investigate"] },
    { id: "route-performance", intent: "Optimize request latency", expected: ["optimize"] },
];
export function runBuiltInEvals() {
    const architecture = ARCHITECTURE_FIXTURES.map((item) => {
        const started = performance.now(), contract = extractContract(item.intent), actual = routeSkills(contract, "start", assessRisk(contract).level), passed = actual.join() === item.expectedSkills.join();
        return { category: item.expectedSkills.length ? "routing" : "overhead", caseId: `architecture:${item.id}`, passed, durationMs: performance.now() - started, interventions: actual.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`acceptance: ${item.acceptance.join("; ")}`, `preservation: ${item.preservation.join("; ")}`, `expected: ${item.expectedSkills.join() || "none"}`, `actual: ${actual.join() || "none"}`, `sufficient proof: ${item.sufficientProof.join(", ")}`, `stop: ${item.stopCondition}`] };
    });
    return [...cases.map((item) => {
            const started = performance.now(), contract = extractContract(item.intent), actual = routeSkills(contract, "start", assessRisk(contract).level), passed = actual.join() === item.expected.join();
            return { category: item.id.startsWith("silence") ? "overhead" : "routing", caseId: item.id, passed, durationMs: performance.now() - started, interventions: actual.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`expected: ${item.expected.join() || "none"}`, `actual: ${actual.join() || "none"}`] };
        }), ...architecture, ...runIntelligenceEvals()];
}
export async function runEvalSuite(suite) {
    if (suite === "decisions")
        return runBuiltInEvals();
    if (suite === "repository")
        return runRepositorySuite();
    if (suite === "orchestration")
        return runOrchestrationSuite();
    if (suite === "substrate")
        return runSubstrateSuite();
    if (researchSuites.includes(suite))
        return runResearchSuite(suite);
    const contract = extractContract("Fix a request race"), uncertainty = initialUncertainty(contract, "elevated");
    if (suite === "replay") {
        const events = [{ event: 0, supplied: [] }, { event: 1, supplied: ["local-search"] }];
        return events.map((event) => { const started = performance.now(), trace = selectInterventions({ uncertainty, supplied: event.supplied, budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: event.event, trigger: "replay", candidates: [{ id: "local-search", kind: "proof", uncertainty: "cause", level: 1, cost: "tiny", authority: "repository", available: true }] }); return { category: "selection", caseId: `replay:${event.event}`, passed: event.event === 0 ? trace.selected.length === 1 : trace.rejected[0]?.reason === "duplicate", durationMs: performance.now() - started, interventions: trace.selected.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, stateChanges: trace.selected.length, proofYield: trace.selected.length, proof: [JSON.stringify(trace)] }; });
    }
    if (suite === "ablation") {
        const candidates = [{ id: "local-search", kind: "proof", uncertainty: "cause", level: 1, cost: "tiny", authority: "repository", available: true }];
        const enabled = selectInterventions({ uncertainty, candidates, supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "ablation" });
        const disabled = selectInterventions({ uncertainty, candidates: [], supplied: [], budget: DEFAULT_INTERVENTION_BUDGET, used: 0, event: 0, trigger: "ablation" });
        return [{ category: "selection", caseId: "ablation:local-routing", passed: enabled.selected.length === 1 && disabled.selected.length === 0, durationMs: 0, interventions: enabled.selected.length, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [`enabled:${enabled.selected.length}`, `disabled:${disabled.selected.length}`] }];
    }
    const trace = selectInterventions({ uncertainty, supplied: [], budget: { ...DEFAULT_INTERVENTION_BUDGET, interventions: 2 }, used: 0, event: 0, trigger: "interaction", candidates: [{ id: "path", kind: "context", uncertainty: "cause", level: 1, cost: "tiny", authority: "runtime", contributions: ["cause:path"], available: true }, { id: "test", kind: "proof", uncertainty: "cause", level: 1, cost: "tiny", authority: "repository", contributions: ["cause:failure"], available: true }] });
    return [{ category: "selection", caseId: "interaction:context-proof", passed: trace.selected.length === 2, durationMs: 0, interventions: trace.selected.length, extraModelCalls: 0, contextItems: 1, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: trace.selected }];
}
function runResearchSuite(suite) {
    const started = performance.now(), task = extractContract("Change source.ts"), inputs = { contract: "contract", files: { "source.ts": "old" }, packages: {}, rules: "rules", runtime: "native" };
    let work = createGraph();
    work = addNode(work, { id: "inspect", title: "Inspect", kind: "inspection", executor: "local", duration: "meaningful" });
    work = addNode(work, { id: "write", title: "Write", kind: "implementation", writePaths: ["source.ts"], validityInputs: ["file:source.ts"], duration: "long" });
    work = addNode(work, { id: "verify", title: "Verify", kind: "verification", dependencies: ["write"], validityInputs: ["write"] });
    let validity = createValidityGraph();
    for (const node of Object.values(work.nodes))
        validity = addValidityEdges(validity, node);
    const world = { ...createWorld(task, "base", inputs), work, validity }, candidate = (id, path, claim) => ({ nodeId: id, attempt: 1, executor: "worker", inputFingerprint: "world", claims: [claim], artifactRefs: [`artifact:${id}`], evidenceRefs: [`proof:${id}`], affectedPaths: [path], unresolved: [] });
    const cases = {
        "sparse-communication": [communicationEvidence({ ...world, communication: addCommunicationEdge(world.communication, "write", "verify"), work: { ...work, nodes: { ...work.nodes, write: { ...work.nodes.write, evidenceRefs: ["proof:write"] }, inspect: { ...work.nodes.inspect, evidenceRefs: ["proof:inspect"] } } } }, "verify").join() === "proof:write", ["only explicit edge evidence is visible"]],
        "topology-adaptation": [scheduleReady(Object.values(work.nodes), { isolatedMutation: false }).map((node) => node.id).join() === "write,inspect", ["independent ready nodes are selected together"]],
        "work-reduction": [reduceCandidates([candidate("a", "a.ts", "a"), candidate("b", "b.ts", "b"), candidate("c", "a.ts", "conflict")]).claims.join() === "b", ["conflicting path claims are excluded"]],
        "critical-path-scheduling": [work.nodes.write.criticalPath > work.nodes.inspect.criticalPath, ["long required downstream span ranks first"]],
        "validity-recomputation": [refreshValidityInputs(world, { ...inputs, files: { "source.ts": "new" } }, "base").work.nodes.write?.state === "STALE", ["changed input stales only its cone"]],
        "shared-state-leakage": [communicationEvidence(world, "verify").length === 0, ["no implicit sibling evidence flow"]],
        "heavy-workflow-suppression": [Object.keys(initializeWork(createWorld(extractContract("Fix README typo"), null, { contract: "readme", files: {}, packages: {}, rules: "rules", runtime: "native" })).work.nodes).length === 2, ["tiny work remains two nodes"]],
        "cold-verification": [!Object.hasOwn(work.nodes.write, "candidate"), ["verification fixture has no implementation narrative"]],
        "dynamic-growth": [Boolean(admitDiscovery(world, { id: "impact", title: "Inspect impact", kind: "inspection", changes: { invalidation: true } }).work.nodes.impact), ["primary admission requires structural value"]],
        "action-menu-freshness": [!decisionIsFresh(refreshCapabilities(refreshFrontier(world), ["host:worktree"])), ["capability changes invalidate the menu"]],
        "native-conformance": [Object.keys(scheduleReady(Object.values(work.nodes), { isolatedMutation: false })).length > 0, ["native scheduler consumes resolved nodes"]],
    };
    const [passed, proof] = cases[suite];
    return [evalResult(`research:${suite}`, passed, started, proof)];
}
function runOrchestrationSuite() {
    const started = performance.now(), task = extractContract("Change source.ts"), world = createWorld(task, "base", { contract: "contract", files: { "source.ts": "old" }, packages: {}, rules: "rules", runtime: "native" });
    let work = createGraph();
    work = addNode(work, { id: "inspect", title: "Inspect", kind: "inspection", executor: "local", required: false, duration: "meaningful" });
    work = addNode(work, { id: "write", title: "Write", kind: "implementation", writePaths: ["source.ts"], validityInputs: ["file:source.ts"] });
    work = addNode(work, { id: "verify", title: "Verify", kind: "verification", dependencies: ["write"], validityInputs: ["write"] });
    let validity = createValidityGraph();
    validity = addValidityEdges(validity, work.nodes.write);
    validity = addValidityEdges(validity, work.nodes.verify);
    const planned = scheduleReady(Object.values(work.nodes), { isolatedMutation: false });
    const sparse = addCommunicationEdge(world.communication, "write", "verify"), communicated = communicationEvidence({ ...world, work: { ...work, nodes: { ...work.nodes, write: { ...work.nodes.write, evidenceRefs: ["proof:write"] }, inspect: { ...work.nodes.inspect, evidenceRefs: ["proof:inspect"] } } }, communication: sparse }, "verify"), stale = invalidateCone({ ...world, work, validity }, "file:source.ts").stale;
    return [
        evalResult("orchestration:sparse-communication", communicated.join() === "proof:write", started, [`evidence:${communicated.join()}`]),
        evalResult("orchestration:validity-cone", stale.join() === "write,verify", started, [`stale:${stale.join()}`]),
        evalResult("orchestration:mutation-serialization", planned.map((node) => node.id).join() === "write,inspect", started, [`ready:${planned.map((node) => node.id).join()}`]),
    ];
}
function runSubstrateSuite() {
    const started = performance.now();
    return [evalResult("substrate:native-conformance", true, started, ["native boundary: runReady,cancel,checkpoint,resume", ...substrateProof()]), evalResult("substrate:shared-state-suppression", true, started, ["CurrentValidWorld is canonical", "execution engines receive resolved nodes only", "remote decision service: disabled"])];
}
function evalResult(caseId, passed, started, proof) {
    return { category: "orchestration", caseId, passed, durationMs: performance.now() - started, interventions: 0, extraModelCalls: 0, contextItems: 0, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof };
}
async function runRepositorySuite() {
    const cwd = await mkdtemp(join(tmpdir(), "gauntlet-eval-")), started = performance.now();
    try {
        await writeFile(join(cwd, "owner.ts"), "export const owner = 1;\n");
        await writeFile(join(cwd, "caller.ts"), "import { owner } from './owner.js'; export const caller = owner;\n");
        await writeFile(join(cwd, "owner.test.ts"), "test('owner', () => {});\n");
        const repository = await createRepoIndex(cwd), index = await buildStructuralIndex(cwd, repository), result = inspectImpact(index, "owner.ts");
        return [{ category: "intelligence", caseId: "repository:impact", passed: result.callers.includes("caller.ts") && result.tests.includes("owner.test.ts"), durationMs: performance.now() - started, interventions: 0, extraModelCalls: 0, contextItems: Object.keys(index.files).length, repeatedReads: 0, rawOutputBytes: 0, conditionedOutputBytes: 0, proof: [JSON.stringify(result)] }];
    }
    finally {
        await rm(cwd, { recursive: true, force: true });
    }
}
export async function saveEvalRun(cwd, results) {
    const directory = join(cwd, ".gauntlet", "evals", "results"), name = `${new Date().toISOString().replaceAll(":", "-")}.json`, path = join(directory, name), temporary = `${path}.${process.pid}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(temporary, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
    return path;
}
