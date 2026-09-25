import { createHash, randomUUID } from "node:crypto";
import { captureBaseline, captureBinaryDiff, changedFiles } from "../repo/git.js";
import { detectRepository } from "../repo/detect.js";
import { inspectTestIntegrity } from "../verify/test-integrity.js";
import { selectVerification } from "../verify/selector.js";
import { runVerification } from "../verify/runner.js";
import { createContextPacket, formatContext } from "./context.js";
import { evaluateGuards, loopFinding } from "./guard.js";
import { detectAmbiguity, extractContract } from "./intent.js";
import { frontierWait, measure } from "./measure.js";
import { STEERING_POLICY } from "./steer.js";
import { createControlState } from "./task-state.js";
import { StateStore } from "../state/store.js";
import { deriveFacts } from "../repo/memory.js";
import { compact, shouldCompact } from "./compact.js";
import { discoverConventions, selectConventionFacts } from "../repo/conventions.js";
import { inspectConventionDrift } from "../verify/convention-drift.js";
import { inspectSlop } from "../verify/slop.js";
import { DEFAULT_INTERVENTION_BUDGET } from "./policy.js";
import { assessRisk } from "./risk.js";
import { loadSkill, skillCandidates } from "./skills.js";
import { createRepoIndex, fingerprintFiles } from "../repo/index.js";
import { normalizeSearch, repeatedSearch } from "../context/governor.js";
import { LocalExecutionEnvironment } from "../execution/local.js";
import { verifyCounterfactual } from "../verify/counterfactual.js";
import { initialUncertainty } from "../control/uncertainty.js";
import { observeExecution, recordVerification } from "../execution-state/runtime.js";
import { buildStructuralIndex, updateStructuralIndex } from "../intelligence/index.js";
import { loadStructuralIndex, saveStructuralIndex } from "../intelligence/store.js";
import { domainCandidates } from "../domains/resolver.js";
import { graphExpansionCandidate, inspectImpact } from "../intelligence/working-graph.js";
import { reconstruct } from "../execution-state/reconstruct.js";
import { remainingProof } from "../verify/proof-selector.js";
import { ArtifactStore } from "../output/store.js";
import { coldViewHasEvidence, compileWorkerPacket, createVerificationView } from "../evidence/packets.js";
import { CapabilityRegistry } from "../capabilities/registry.js";
import { CapabilityResolver } from "../capabilities/resolver.js";
import { adapter } from "../adapters/install.js";
import { controlRuntime } from "../control/runtime.js";
import { assessScope } from "../intelligence/scope.js";
import { compileRules } from "../repo/rules.js";
import { decideCompletion } from "../verify/completion.js";
import { hasSufficientProof } from "../verify/proof-selector.js";
import { capabilityCandidates } from "../control/capabilities.js";
import { GraphEventStore } from "../work/event-store.js";
import { admitDiscovery, initializeWork, observeWorldTransition, proposeNodeResult, refreshFrontier } from "../work/runtime.js";
import { applyCandidateEvaluation, evaluateCandidate } from "../verify/candidate.js";
import { createWorld } from "../work/world.js";
import { addDependency, collapseValidated, fingerprint as worldFingerprint, readyFrontier, retryNode, selectDecisionNode } from "../work/graph.js";
import { approachFingerprint } from "../work/precheck.js";
import { NativeExecutionEngine } from "../execution/native-engine.js";
import { verifyIsolatedPatch } from "../verify/promotion.js";
import { semanticSynthesisRequest } from "../work/reducer.js";
export class GauntletEngine {
    cwd;
    options;
    store;
    registry = new CapabilityRegistry();
    resolver;
    constructor(cwd, options = {}) {
        this.cwd = cwd;
        this.options = options;
        this.store = new StateStore(cwd);
        this.registry.register({ id: "gauntlet:output", kind: "output", source: "gauntlet", available: true, value: () => new ArtifactStore(cwd) });
        this.registry.register({ id: "gauntlet:execution", kind: "execution", source: "gauntlet", available: true, value: () => new LocalExecutionEnvironment(cwd) });
        this.registry.register({ id: "gauntlet:search", kind: "search", source: "gauntlet", available: true, value: () => createRepoIndex });
        this.registry.register({ id: "gauntlet:skill", kind: "skill", source: "gauntlet", available: true, value: () => loadSkill });
        if (options.harness) {
            const host = adapter(options.harness);
            this.registry.register({ id: `host:${host.name}:output`, kind: "output", source: "host", available: host.capabilities.output.replacement !== "none", value: () => host.capabilities.output });
            this.registry.register({ id: `host:${host.name}:browser`, kind: "browser", source: "host", available: host.capabilities.tools.browser, value: () => host.capabilities.tools.browser });
            this.registry.register({ id: `host:${host.name}:delegation`, kind: "delegation", source: "host", available: host.capabilities.delegation.supported, value: () => host.capabilities.delegation });
        }
        for (const capability of options.capabilities ?? [])
            this.registry.register(capability);
        this.resolver = new CapabilityResolver(this.registry);
    }
    async state(id) { return this.store.loadTask(id); }
    capability(kind) { return this.resolver.resolve(kind); }
    async clarify(id, question, answer) {
        return this.store.updateTask(id, (state) => { state.clarifications = [{ question, answer, at: new Date().toISOString() }]; });
    }
    async start(intent, id = randomUUID()) {
        try {
            let state = await this.store.loadTask(id);
            if (!state.world.work.nodes.implementation || !state.world.work.nodes.verification)
                state = await this.store.updateTaskWithWorldEvent(id, (value) => {
                    value.world = initializeWork(value.world);
                    return { at: new Date().toISOString(), type: "NODE_CREATED", detail: "Resumed V2 state with implementation and verification nodes" };
                });
            const context = await createContextPacket(this.cwd, state.contract, state.conventions, state.baseline.index, reconstruct(state));
            const ambiguity = detectAmbiguity(state.contract);
            return { state, injection: await injection(context, state.control?.activeSkills ?? []), clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null, directive: startDirective(state.contract.size, ambiguity.costly) };
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        const baseline = await captureBaseline(this.cwd), profile = await detectRepository(this.cwd);
        const contract = extractContract(intent, { ...(baseline.index ? { files: baseline.index.files } : {}), dependencies: baseline.dependencies });
        const initialTargets = contract.explicitPaths.filter((path) => /\.[cm]?[jt]sx?$/.test(path));
        if (baseline.index && initialTargets.length) {
            const structural = await buildStructuralIndex(this.cwd, baseline.index, initialTargets, 160);
            baseline.publicExports = Object.fromEntries(Object.entries(structural.files).map(([path, file]) => [path, file.exports]));
            await saveStructuralIndex(this.cwd, structural);
        }
        const conventionProfile = await discoverConventions(this.cwd, contract.explicitPaths, undefined, baseline.index), conventions = selectConventionFacts(conventionProfile, contract);
        const context = await createContextPacket(this.cwd, contract, conventions, baseline.index);
        const ambiguity = detectAmbiguity(contract);
        const risk = assessRisk(contract);
        const uncertainty = initialUncertainty(contract, risk.level), rootId = randomUUID(), budget = { ...DEFAULT_INTERVENTION_BUDGET };
        const control = createControlState(contract, rootId);
        control.uncertainty = uncertainty;
        control.budget = budget;
        control.capabilities = this.registry.all().map((item) => ({ kind: item.kind, source: item.source, available: item.available }));
        const rules = compileRules(conventions);
        const configFingerprints = await fingerprintFiles(this.cwd, baseline.index?.configs ?? []);
        let world = initializeWork(createWorld(contract, baseline.head, { contract: worldFingerprint(contract), files: Object.fromEntries(contract.explicitPaths.flatMap((path) => baseline.files[path] ? [[path, baseline.files[path].hash]] : [])), packages: Object.fromEntries(baseline.dependencies.map((dependency) => [dependency, dependency])), config: Object.fromEntries(Object.entries(configFingerprints).map(([path, value]) => [path, value.hash])), upstream: {}, rules: worldFingerprint(conventions), runtime: "native" }));
        world = { ...world, uncertainties: Object.entries(uncertainty).filter(([, status]) => status === "open" || status === "partial").map(([kind]) => kind), rules: rules.map((rule) => rule.id), capabilities: control.capabilities.filter((capability) => capability.available).map((capability) => `${capability.source}:${capability.kind}`) };
        const events = new GraphEventStore(this.cwd);
        for (const event of [{ type: "NODE_CREATED", nodeId: "implementation" }, { type: "NODE_CREATED", nodeId: "verification" }, { type: "DEPENDENCY_ADDED", nodeId: "verification" }, { type: "NODE_READY", nodeId: "implementation" }])
            world = { ...world, appliedEvent: (await events.append(id, { at: new Date().toISOString(), ...event }, world)).sequence };
        const state = { version: 3, id, repository: this.cwd, startedAt: new Date().toISOString(), contract, clarifications: [], baseline, workingSet: context.entries.map((entry) => entry.path), repositoryFacts: await deriveFacts(this.cwd, profile), conventions, rules, conventionMetrics: { hints: conventions.length, primitives: conventions.filter((fact) => fact.category === "primitive").length, interventions: 0, dependencyConflicts: 0, duplicates: 0, architectureBypasses: 0 }, activities: [], findings: [], attempts: 1, control, world };
        const runtime = controlRuntime(state, { trigger: "task_start", candidates: [...skillCandidates(contract, "start", risk.level), ...domainCandidates(profile, contract)] }), activation = runtime.plan;
        const activeSkills = activation.skills.flatMap((candidate) => candidate.skill ? [candidate.skill] : []);
        control.activeSkills = activeSkills.slice(0, 1);
        control.interventionsUsed = control.activeSkills.length;
        if (control.activeSkills.length)
            runtime.decision.stateChange = control.activeSkills.map((skill) => `workflow:${skill}`);
        await this.store.saveTask(state);
        return { state, injection: await injection(context, state.control?.activeSkills ?? []), clarification: ambiguity.costly ? ambiguity.question ?? "Clarify the expected observable behavior." : null, directive: startDirective(contract.size, ambiguity.costly) };
    }
    async activity(id, activity) {
        const currentState = await this.store.loadTask(id);
        if (activity.toolPayload) {
            const open = Object.entries(currentState.control.uncertainty).filter(([, value]) => value === "open" || value === "partial").map(([kind]) => kind).join(", ");
            const artifact = await new ArtifactStore(this.cwd).put(id, activity.toolPayload, currentState.activities.length, currentState.contract.goal, open);
            const { toolPayload: _stored, ...bounded } = activity;
            activity = { ...bounded, artifactRef: artifact.artifactRef };
        }
        const fingerprint = (activity.kind === "file_read" || activity.kind === "file_write") && activity.target && !activity.target.startsWith("../") && !activity.target.startsWith("/") ? (await fingerprintFiles(this.cwd, [activity.target]))[activity.target] : undefined;
        let writtenImpact = null, immediateFindings = [];
        if (activity.kind === "file_write" && activity.target && !activity.target.startsWith("../") && !activity.target.startsWith("/")) {
            const repository = await createRepoIndex(this.cwd), cached = await loadStructuralIndex(this.cwd, repository.head);
            const structural = cached ? await updateStructuralIndex(this.cwd, repository, cached, [activity.target], 160) : await buildStructuralIndex(this.cwd, repository, [activity.target], 160);
            await saveStructuralIndex(this.cwd, structural);
            writtenImpact = inspectImpact(structural, activity.target);
            const changes = await changedFiles(this.cwd, currentState.baseline), profile = await detectRepository(this.cwd), scope = assessScope(currentState.contract, changes, currentState.baseline.dependencies, profile.dependencies ?? [], structural, currentState.baseline.publicExports);
            immediateFindings = [...await inspectTestIntegrity(this.cwd, currentState.baseline.tests, changes), ...await inspectConventionDrift(this.cwd, currentState, changes)].filter((item) => item.blocking);
            immediateFindings.push(...scope.hardSignals.map((message) => ({ code: "scope-hard-signal", severity: "error", blocking: true, message, proof: scope.actual })));
        }
        let workflowChanged = false, directive = { action: "continue", reason: "No control action is required" };
        const state = await this.store.updateTaskWithWorldEvent(id, (value) => {
            value.activities.push(activity);
            if (activity.artifactRef)
                value.control.context.artifactRefs = [...value.control.context.artifactRefs, activity.artifactRef].slice(-200);
            if (activity.kind === "message")
                value.control.context.recentCompletedTurns = [...value.control.context.recentCompletedTurns, value.activities.length - 1].slice(-3);
            if (value.activities.length > 1_000) {
                const removed = value.activities.length - 1_000;
                value.activities.splice(0, removed);
                value.control.lastCompactedActivity = Math.max(0, value.control.lastCompactedActivity - removed);
                value.control.context.recentCompletedTurns = value.control.context.recentCompletedTurns.map((index) => index - removed).filter((index) => index >= 0).slice(-3);
            }
            const loop = loopFinding(value);
            value.findings = deduplicateFindings([...value.findings, ...immediateFindings]);
            if (loop && !value.findings.some((finding) => finding.code === loop.code))
                value.findings.push(loop);
            if (value.control && activity.kind === "file_read" && activity.target && fingerprint) {
                const existing = value.control.observations.find((item) => item.path === activity.target);
                if (existing?.hash === fingerprint.hash)
                    value.control.repeatReadsDetected += 1;
                value.control.observations = [{ path: activity.target, hash: fingerprint.hash, lastObserved: value.activities.length, relevantSymbols: [] }, ...value.control.observations.filter((item) => item.path !== activity.target)].slice(0, 64);
            }
            if (value.control && activity.kind === "file_write" && activity.target) {
                value.control.observations = value.control.observations.filter((item) => item.path !== activity.target);
                value.control.scope.actual = [...new Set([...value.control.scope.actual, activity.target])];
                if (writtenImpact) {
                    value.control.impact = { ...value.control.impact, owners: writtenImpact.owner ? [writtenImpact.owner] : [], dependencies: writtenImpact.dependencies, callers: writtenImpact.callers, tests: writtenImpact.tests, packageCrossings: writtenImpact.packageCrossings, publicSurface: writtenImpact.publicSurface ? [writtenImpact.target] : [], confidence: writtenImpact.confidence };
                    const expected = value.control.scope.expected.includes(activity.target), material = writtenImpact.packageCrossings.length > 0 || writtenImpact.publicSurface || /(?:^|\/)(?:migrations?|schema|auth|security|permissions?)(?:\/|\.|$)/i.test(activity.target);
                    if (!expected && material) {
                        value.control.scope.unexpected = [...new Set([...value.control.scope.unexpected, activity.target])];
                        value.control.uncertainty.scope = "open";
                    }
                }
            }
            const search = activity.kind === "command" && activity.target ? normalizeSearch(activity.target) : null;
            if (value.control && search) {
                const observation = { ...search, version: value.baseline.index?.head ?? "filesystem", matches: [] }, searches = value.control.searches ?? [];
                if (repeatedSearch(searches, observation))
                    value.control.repeatSearchesDetected = (value.control.repeatSearchesDetected ?? 0) + 1;
                else
                    value.control.searches = [observation, ...searches].slice(0, 32);
            }
            if (value.control) {
                const transition = observeExecution(value, activity);
                let routed = false;
                if (transition.investigate && value.control.uncertainty) {
                    value.control.uncertainty.cause = "open";
                    const candidate = { id: "skill:investigate", kind: "skill", skill: "investigate", uncertainty: "cause", resolves: ["cause"], level: 3, cost: "low", authority: "local", source: "skills/investigate/SKILL.md", reason: "Execution progress stalled while cause remains open", available: true };
                    const runtime = controlRuntime(value, { trigger: transition.trigger ?? (activity.kind === "file_write" ? "file_write" : activity.outcome === "fail" ? "failure" : "activity"), candidates: [candidate], supplied: value.control.activeSkills.map((skill) => `skill:${skill}`), missedActivationCost: 3, proofGain: activity.artifactRef ? [activity.artifactRef] : [] }), trace = runtime.plan.trace;
                    directive = runtime.directive;
                    routed = true;
                    if (trace.selected.includes(candidate.id)) {
                        trace.changedState = true;
                        value.control.activeSkills = ["investigate"];
                        value.control.interventionsUsed = (value.control.interventionsUsed ?? 0) + 1;
                        runtime.decision.stateChange = ["workflow:investigate"];
                        workflowChanged = true;
                    }
                }
                if (transition.causeValidated && value.control.uncertainty) {
                    value.control.uncertainty.cause = "resolved";
                    const candidate = { id: "skill:implement", kind: "skill", skill: "implement", uncertainty: "behavior", resolves: ["behavior", "scope"], level: 3, cost: "low", authority: "local", source: "skills/implement/SKILL.md", reason: "Validated cause makes implementation the next useful workflow", available: true };
                    const runtime = controlRuntime(value, { trigger: "cause_validated", candidates: [candidate], missedActivationCost: 3, proofGain: activity.artifactRef ? [activity.artifactRef] : [] }), activation = runtime.plan;
                    directive = runtime.directive;
                    routed = true;
                    if (activation.skills.length) {
                        activation.trace.changedState = value.control.activeSkills.length !== 1 || value.control.activeSkills[0] !== "implement";
                        value.control.activeSkills = ["implement"];
                        value.control.interventionsUsed = (value.control.interventionsUsed ?? 0) + 1;
                        runtime.decision.stateChange = ["workflow:implement", "uncertainty:cause=resolved"];
                        workflowChanged = true;
                    }
                }
                if (!routed)
                    directive = controlRuntime(value, { trigger: activity.kind === "file_write" ? "file_write" : activity.outcome === "fail" ? "failure" : "activity", candidates: [], stateChange: transition.progress ? [`progress:${transition.progress.toLowerCase()}`] : [], proofGain: activity.artifactRef ? [activity.artifactRef] : activity.proofRef ? [activity.proofRef] : [] }).directive;
            }
            const previous = Object.fromEntries(Object.entries(value.world.work.nodes).map(([nodeId, node]) => [nodeId, node.state]));
            const worldTransition = observeWorldTransition(value.world, activity, fingerprint?.hash);
            value.world = { ...worldTransition.world, uncertainties: Object.entries(value.control.uncertainty).filter(([, status]) => status === "open" || status === "partial").map(([kind]) => kind) };
            const stale = Object.entries(value.world.work.nodes).filter(([nodeId, node]) => node.state === "STALE" && previous[nodeId] !== "STALE").map(([nodeId]) => nodeId);
            const at = new Date().toISOString(), detail = activity.target;
            return [
                { at, type: activity.kind === "file_write" ? "FACT_INVALIDATED" : activity.outcome === "fail" ? "RESULT_STALE" : "NODE_READY", ...(detail ? { detail } : {}) },
                ...stale.map((nodeId) => ({ at, type: "DESCENDANTS_STALE", nodeId, ...(detail ? { detail } : {}) })),
                ...worldTransition.cancel.map((nodeId) => ({ at, type: "WORKER_CANCELLED", nodeId, ...(detail ? { detail } : {}) })),
            ];
        });
        if (immediateFindings.length)
            directive = { action: "validate", reason: immediateFindings.map((item) => item.message).join("; ") };
        const decision = shouldCompact(state);
        let continuation = decision.compact || workflowChanged ? compact(state) : null;
        if (continuation && workflowChanged) {
            const skill = state.control?.activeSkills[0];
            continuation = { ...continuation, ...(skill ? { workflow: skill, guidance: await loadSkill(skill) } : {}) };
        }
        if (continuation && decision.compact)
            await this.store.updateTask(id, (value) => { if (value.control) {
                value.control.lastCompactedActivity = value.activities.length;
                value.control.compactions += 1;
            } });
        return { state, continuation, directive };
    }
    async lifecycle(id, phase) {
        const state = await this.store.updateTask(id, (value) => {
            controlRuntime(value, { trigger: "lifecycle", candidates: [], stateChange: [`lifecycle:${phase}`] });
            if (phase === "pre_compact") {
                value.control.lastCompactedActivity = value.activities.length;
                value.control.compactions += 1;
            }
        });
        return { state, continuation: compact(state) };
    }
    async finish(id) {
        const state = await this.store.loadTask(id), changes = await changedFiles(this.cwd, state.baseline);
        const current = [...await evaluateGuards(this.cwd, state, changes), ...await inspectTestIntegrity(this.cwd, state.baseline.tests, changes), ...await inspectConventionDrift(this.cwd, state, changes), ...await inspectSlop(this.cwd, state, changes)];
        state.findings = deduplicateFindings(current);
        if (state.conventionMetrics) {
            state.conventionMetrics.dependencyConflicts = state.findings.filter((item) => item.code === "convention-dependency-conflict").length;
            state.conventionMetrics.duplicates = state.findings.filter((item) => item.code === "convention-duplicate-primitive").length;
            state.conventionMetrics.architectureBypasses = state.findings.filter((item) => item.code === "convention-architecture-bypass").length;
            state.conventionMetrics.interventions = state.findings.filter((item) => item.code.startsWith("convention-")).length;
        }
        const codeChanges = changes.filter((item) => /\.[cm]?[jt]sx?$/.test(item.path));
        if (changes.length && state.control?.uncertainty?.location === "partial")
            state.control.uncertainty.location = "resolved";
        const currentIndex = codeChanges.length ? await createRepoIndex(this.cwd) : state.baseline.index;
        const cachedStructural = currentIndex ? await loadStructuralIndex(this.cwd, currentIndex.head) : null;
        const structuralTargets = [...new Set([...state.contract.explicitPaths, ...codeChanges.map((item) => item.path), ...state.workingSet])].filter((path) => /\.[cm]?[jt]sx?$/.test(path));
        const graphCandidate = state.control?.uncertainty && codeChanges.length ? graphExpansionCandidate(state.control.uncertainty, Boolean(currentIndex)) : null;
        const available = Object.fromEntries(["docs", "browser", "delegation"].map((kind) => [kind, Boolean(this.capability(kind).capability)]));
        const candidates = [...(graphCandidate ? [graphCandidate] : []), ...capabilityCandidates(state, available)];
        const beforeStop = controlRuntime(state, { trigger: "before_stop", candidates, missedActivationCost: 4 }), graphActivation = beforeStop.plan;
        const expandGraph = Boolean(graphActivation?.graphExpansions.length);
        for (const selected of graphActivation.capabilities) {
            if (selected.id === "capability:docs")
                state.control.externalDocCalls += 1;
            if (selected.id === "capability:browser")
                state.control.browserActivations += 1;
            if (selected.id === "capability:delegation")
                state.control.delegations += 1;
        }
        if (graphActivation.trace.selected.length)
            beforeStop.decision.stateChange = graphActivation.trace.selected.map((item) => `selected:${item}`);
        const structural = currentIndex && codeChanges.length && expandGraph ? cachedStructural
            ? await updateStructuralIndex(this.cwd, currentIndex, cachedStructural, codeChanges.map((item) => item.path), 160)
            : await buildStructuralIndex(this.cwd, currentIndex, structuralTargets, 160) : !codeChanges.length ? cachedStructural ?? undefined : undefined;
        if (structural)
            await saveStructuralIndex(this.cwd, structural);
        let impactEvidenceRef;
        if (expandGraph && structural) {
            const artifact = await new ArtifactStore(this.cwd).put(state.id, { operation: "inspect-impact", target: structuralTargets.join(","), input: JSON.stringify(structuralTargets), output: JSON.stringify(structural), status: "pass", semanticDescription: "Bounded repository impact inspection", paths: structuralTargets, symbols: [], processor: "json" }, state.activities.length, state.contract.goal, "location, repository fit, regression");
            impactEvidenceRef = artifact.artifactRef;
            state.control.context.artifactRefs = [...state.control.context.artifactRefs, artifact.artifactRef].slice(-200);
            beforeStop.decision.proofGain.push(artifact.artifactRef);
        }
        if (expandGraph && structural && state.control) {
            state.control.graphExpansions = (state.control.graphExpansions ?? 0) + 1;
            state.control.interventionsUsed = (state.control.interventionsUsed ?? 0) + 1;
        }
        const profile = await detectRepository(this.cwd);
        const scope = assessScope(state.contract, changes, state.baseline.dependencies, profile.dependencies ?? [], structural, state.baseline.publicExports);
        state.control.scope = scope;
        for (const message of scope.hardSignals)
            state.findings.push({ code: "scope-hard-signal", severity: "error", blocking: true, message, proof: scope.actual });
        for (const message of scope.softSignals)
            state.findings.push({ code: "scope-soft-signal", severity: "warning", blocking: false, message, proof: scope.actual });
        const plan = selectVerification(profile, changes, currentIndex?.files, structural, state.control?.uncertainty ? { uncertainty: state.control.uncertainty, budget: state.control.budget, event: state.activities.length } : undefined);
        if (plan.selectionTrace && state.control)
            state.control.traces = [...(state.control.traces ?? []), plan.selectionTrace].slice(-64);
        const results = await runVerification(this.cwd, plan, undefined, state.id);
        const risk = assessRisk(state.contract, changes), newTest = changes.some((change) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(change.path) && !(change.path in state.baseline.tests)), testCheck = plan.checks.find((check) => check.id.includes("test"));
        if (risk.level === "elevated" && newTest && testCheck && state.baseline.head && this.options.preChangeEnvironment) {
            const candidateTests = changes.filter((change) => /(?:test|spec)\.[cm]?[jt]sx?$/.test(change.path)).map((change) => change.path), before = await this.options.preChangeEnvironment(state.baseline.head, candidateTests), counterfactual = await verifyCounterfactual(testCheck, before, new LocalExecutionEnvironment(this.cwd), true);
            if (counterfactual.status === "weak")
                state.findings.push({ code: "weak-counterfactual", severity: "warning", blocking: true, message: "The new behavioral check also passes against pre-change behavior.", proof: counterfactual.proof });
        }
        if (state.control?.uncertainty && !state.findings.some((item) => item.code.startsWith("convention-")))
            state.control.uncertainty.repoFit = state.control.uncertainty.repoFit === "irrelevant" ? "irrelevant" : "resolved";
        const machinePassed = results.length > 0 && results.every((result) => result.status === "pass") && state.findings.every((finding) => !finding.blocking);
        const supplied = ["diff", ...(structural ? ["graph"] : []), ...(results.some((result) => result.status === "pass" && result.id.includes("test")) ? ["test"] : []), ...(state.findings.some((item) => item.code.startsWith("convention-")) ? [] : ["repository_rule"])];
        state.control.availableProof = [...new Set(supplied)];
        beforeStop.decision.proofGain = [...beforeStop.decision.proofGain, ...results.map((result) => result.proof).filter((item) => Boolean(item))];
        const obtainable = ["diff", "repository_rule", ...(currentIndex ? ["search"] : []), ...(structural || currentIndex ? ["graph"] : []), ...(plan.checks.some((check) => check.id.includes("test")) ? ["test"] : []), ...(this.options.availableProof ?? [])];
        const outstanding = machinePassed && state.control?.uncertainty ? remainingProof(state.control.uncertainty, supplied, obtainable) : [];
        for (const item of outstanding)
            state.findings.push({ code: `unresolved-proof-${item.uncertainty}`, severity: "warning", blocking: true, message: `${item.uncertainty} remains unresolved; provide ${item.proof} proof before completion.`, proof: [] });
        if (machinePassed && state.control.uncertainty)
            for (const kind of Object.keys(state.control.uncertainty))
                if (state.control.uncertainty[kind] !== "irrelevant" && hasSufficientProof(kind, supplied))
                    state.control.uncertainty[kind] = "resolved";
        state.world = { ...state.world, uncertainties: Object.entries(state.control.uncertainty).filter(([, status]) => status === "open" || status === "partial").map(([kind]) => kind) };
        state.world = initializeWork(state.world);
        const verificationEvidenceRefs = results.map((result) => result.proof).filter((item) => Boolean(item));
        const patch = state.baseline.status.length === 0 ? await captureBinaryDiff(this.cwd, state.baseline.head) : null;
        const patchRef = patch && changes.length
            ? (await new ArtifactStore(this.cwd).put(state.id, { operation: "git diff --binary", target: state.baseline.head ?? undefined, input: state.baseline.head ?? "filesystem", output: patch, status: "pass", semanticDescription: "Task-local candidate patch", paths: changes.map((change) => change.path), symbols: [], processor: "diff" }, state.activities.length, state.contract.goal, "patch applicability and scope")).artifactRef
            : undefined;
        const evidenceRefs = [...verificationEvidenceRefs, ...(impactEvidenceRef ? [impactEvidenceRef] : []), ...(patchRef ? [patchRef] : [])];
        const artifacts = await Promise.all(evidenceRefs.map(async (ref) => {
            try {
                const store = new ArtifactStore(this.cwd), metadata = await store.metadata(ref), output = await store.raw(ref);
                return metadata.outputHash === createHash("sha256").update(output).digest("hex") && metadata.status === "pass";
            }
            catch {
                return false;
            }
        }));
        const selectedTests = plan.checks.filter((check) => check.id.includes("test"));
        const currentBaseline = await captureBaseline(this.cwd);
        const patchApplicable = patchRef && state.baseline.head ? await verifyIsolatedPatch(this.cwd, state.baseline.head, patch) : true;
        const evaluation = {
            commandPassed: results.length === plan.checks.length && results.every((result) => result.status === "pass"), artifactsPresent: verificationEvidenceRefs.length === results.length && artifacts.length === evidenceRefs.length,
            artifactHashesValid: artifacts.every(Boolean), staticChecksPassed: results.filter((result) => !result.id.includes("test")).every((result) => result.status === "pass"),
            testsPassed: selectedTests.every((check) => results.some((result) => result.id === check.id && result.status === "pass")),
            acceptanceEvidence: machinePassed && evidenceRefs.length > 0, preservationEvidence: !state.findings.some((finding) => finding.blocking) && supplied.every((proof) => proof !== "test" || results.some((result) => result.id.includes("test") && result.status === "pass")),
            coldVerificationPassed: machinePassed && artifacts.every(Boolean), ownershipValid: true,
            baseCompatible: state.world.canonicalRevision === state.baseline.head && currentBaseline.head === state.baseline.head, patchApplicable, scopeValid: scope.hardSignals.length === 0, rulesValid: !state.findings.some((finding) => finding.code.startsWith("convention-") && finding.blocking),
        };
        const graphEvents = new GraphEventStore(this.cwd);
        const recordGraph = async (type, nodeId, detail) => {
            const node = state.world.work.nodes[nodeId], candidate = type === "RESULT_PROPOSED" ? node?.candidate : undefined;
            state.world = { ...state.world, appliedEvent: (await graphEvents.append(state.id, { at: new Date().toISOString(), type, nodeId, ...(detail ? { detail } : {}), ...(node ? { attempt: node.attempt } : {}), ...(candidate ? { candidate } : {}) }, state.world)).sequence };
        };
        const impactNodes = impactEvidenceRef ? structuralTargets.map((_, index) => index ? `impact-inspection-${index + 1}` : "impact-inspection") : [];
        for (const inspectionId of impactNodes)
            if (!state.world.work.nodes[inspectionId]) {
                state.world = admitDiscovery(state.world, { id: inspectionId, title: "Inspect material repository impact", kind: "inspection", executor: "local", duration: "short", validityInputs: ["contract"], changes: { scheduling: true, validation: true, invalidation: true } });
                state.world = refreshFrontier({ ...state.world, revision: state.world.revision + 1, work: addDependency(state.world.work, "implementation", inspectionId) });
                await recordGraph("NODE_CREATED", inspectionId, "Impact inspection changed scheduling and invalidation");
                await recordGraph("DEPENDENCY_ADDED", "implementation", inspectionId);
            }
        const executor = new NativeExecutionEngine(this.cwd, async (node, signal) => {
            const affectedPaths = node.id === "implementation" ? changes.map((change) => change.path) : node.kind === "inspection" ? structuralTargets : [];
            if (node.executor === "worker") {
                if (!this.options.worker)
                    throw new Error(`No worker executor is available: ${node.id}`);
                const result = await this.options.worker(compileWorkerPacket(state, node), signal);
                return { ...result, nodeId: node.id, attempt: node.attempt, executor: "worker", inputFingerprint: state.world.fingerprint.value };
            }
            return {
                nodeId: node.id, attempt: node.attempt, executor: node.executor, inputFingerprint: state.world.fingerprint.value,
                claims: node.id === "implementation" ? (changes.length ? ["Candidate repository change observed"] : ["No repository change observed"]) : node.kind === "inspection" ? ["Candidate impact inspection recorded"] : ["Candidate verification evidence collected"],
                artifactRefs: evidenceRefs, evidenceRefs, affectedPaths, unresolved: [], ...(patchRef ? { patchRef } : {}), ...(state.baseline.head ? { baseRevision: state.baseline.head } : {}),
                approachFingerprint: approachFingerprint({ mechanism: node.kind, target: affectedPaths.join(",") || node.id, assumptions: state.world.rules }),
            };
        });
        const completeNode = async (nodeId, prepared) => {
            const before = state.world.work.nodes[nodeId];
            if (["VALIDATED", "COLLAPSED"].includes(before.state))
                return { disposition: "validated", reasons: [] };
            if (["REJECTED", "STALE"].includes(before.state)) {
                state.world = { ...state.world, work: retryNode(state.world.work, nodeId), revision: state.world.revision + 1 };
                await recordGraph("NODE_RETRIED", nodeId, before.rejection?.constraint);
            }
            state.world = refreshFrontier(state.world);
            selectDecisionNode(state.world, nodeId);
            if (["READY", "REJECTED", "STALE"].includes(before.state))
                await recordGraph("NODE_STARTED", nodeId);
            const candidate = prepared ?? (await executor.runReady([selectDecisionNode(state.world, nodeId)]))[0];
            if (!candidate)
                throw new Error(`Native execution did not return a candidate: ${nodeId}`);
            const { nodeId: _nodeId, attempt: _attempt, inputFingerprint: _fingerprint, ...proposal } = candidate;
            try {
                state.world = proposeNodeResult(state.world, nodeId, proposal);
            }
            catch (error) {
                const reason = error.message;
                if (!reason.startsWith("Rejected approach requires"))
                    throw error;
                const node = state.world.work.nodes[nodeId];
                state.world = { ...state.world, revision: state.world.revision + 1, work: { ...state.world.work, version: state.world.work.version + 1, nodes: { ...state.world.work.nodes, [nodeId]: { ...node, state: "REJECTED" } } } };
                await recordGraph("RESULT_REJECTED", nodeId, reason);
                return { disposition: "rejected", reasons: [reason] };
            }
            await recordGraph("RESULT_PROPOSED", nodeId);
            const candidateNode = state.world.work.nodes[nodeId], inspection = candidateNode.kind === "inspection", nodeEvaluation = inspection
                ? { ...evaluation, acceptanceEvidence: Boolean(impactEvidenceRef), preservationEvidence: true, coldVerificationPassed: artifacts.every(Boolean), scopeValid: true, rulesValid: true }
                : evaluation;
            const candidateArtifacts = await Promise.all((candidateNode.candidate?.artifactRefs ?? []).map((ref) => artifactIsValid(this.cwd, ref)));
            const decision = evaluateCandidate(state.world, candidateNode, { ...nodeEvaluation, artifactHashesValid: nodeEvaluation.artifactHashesValid && candidateArtifacts.length > 0 && candidateArtifacts.every(Boolean), coldVerificationPassed: nodeEvaluation.coldVerificationPassed && coldViewHasEvidence(createVerificationView(state, candidateNode)) });
            const beforeStates = Object.fromEntries(Object.entries(state.world.work.nodes).map(([id, item]) => [id, item.state]));
            state.world = applyCandidateEvaluation(state.world, nodeId, decision);
            if (decision.disposition === "validated") {
                await recordGraph("RESULT_VALIDATED", nodeId);
                for (const [readyId, node] of Object.entries(state.world.work.nodes))
                    if (node.state === "READY" && beforeStates[readyId] !== "READY")
                        await recordGraph("NODE_READY", readyId);
                if (nodeId === "implementation")
                    await recordGraph("PATCH_PROMOTED", nodeId, patchRef ? "Validated task-local patch against the current non-isolated working tree" : "Validated against the current non-isolated working tree");
            }
            else if (decision.disposition === "stale")
                await recordGraph("RESULT_STALE", nodeId, decision.reasons.join("; "));
            else if (decision.disposition === "rejected")
                await recordGraph("RESULT_REJECTED", nodeId, decision.reasons.join("; "));
            return decision;
        };
        let maxFrontier = 0, semanticSynthesis = 0;
        while (true) {
            state.world = refreshFrontier(state.world);
            const ready = readyFrontier(state.world);
            if (!ready.length)
                break;
            maxFrontier = Math.max(maxFrontier, ready.length);
            const candidates = await executor.runReady(ready), synthesis = semanticSynthesisRequest(candidates);
            if (synthesis)
                semanticSynthesis += 1;
            const resolved = synthesis && this.options.synthesize ? await this.options.synthesize(synthesis) : synthesis ? candidates.map((candidate) => synthesis.candidates.some((item) => item.nodeId === candidate.nodeId && item.attempt === candidate.attempt) ? { ...candidate, unresolved: [...new Set([...candidate.unresolved, "behavior"])] } : candidate) : candidates;
            let blocked = false;
            for (const candidate of resolved) {
                const decision = await completeNode(candidate.nodeId, candidate);
                if (decision.disposition !== "validated") {
                    blocked = true;
                    break;
                }
            }
            if (blocked)
                break;
        }
        const validated = Object.values(state.world.work.nodes).filter((node) => node.state === "VALIDATED").map((node) => node.id);
        state.world = collapseValidated(state.world);
        for (const nodeId of validated.filter((id) => state.world.work.nodes[id]?.state === "COLLAPSED"))
            await recordGraph("GRAPH_COLLAPSED", nodeId);
        state.world = refreshFrontier(state.world);
        const completion = decideCompletion(state.contract, state.findings, state.control.uncertainty, supplied, state.world, { repositoryRevision: currentBaseline.head, evidenceValid: artifacts.length === evidenceRefs.length && artifacts.every(Boolean) });
        for (const proof of completion.missingProof)
            state.findings.push({ code: `missing-preservation-${proof}`, severity: "error", blocking: true, message: `Required preservation proof is unavailable: ${proof}`, proof: [] });
        const passed = machinePassed && outstanding.length === 0 && completion.status === "complete";
        recordVerification(state, passed, evidenceRefs, supplied);
        if (passed)
            state.control.activeSkills = [];
        const history = await graphEvents.read(state.id), value = measure(state, changes, results, new Date(), completion, { frontierWaitMs: frontierWait(history), maxFrontier, semanticSynthesis, workerCandidates: history.filter((event) => event.type === "RESULT_PROPOSED" && event.candidate?.executor === "worker").length });
        await this.store.saveTask(state);
        await this.store.saveMeasurement(value);
        return value;
    }
    async retry(id) {
        await this.store.updateTask(id, (state) => { state.attempts += 1; state.control.lifecycle.corrections += 1; });
    }
}
async function injection(context, skills) {
    const loaded = await Promise.all(skills.slice(0, DEFAULT_INTERVENTION_BUDGET.skillInvocations).map(async (name) => { try {
        return await loadSkill(name);
    }
    catch {
        return "";
    } }));
    return [STEERING_POLICY, formatContext(context), ...loaded.filter(Boolean)].join("\n\n");
}
function deduplicateFindings(findings) {
    const seen = new Set();
    return findings.filter((finding) => { const key = `${finding.code}:${finding.proof.join(":")}`; if (seen.has(key))
        return false; seen.add(key); return true; });
}
async function artifactIsValid(cwd, ref) {
    try {
        const store = new ArtifactStore(cwd), metadata = await store.metadata(ref), output = await store.raw(ref);
        return metadata.outputHash === createHash("sha256").update(output).digest("hex") && metadata.status === "pass";
    }
    catch {
        return false;
    }
}
function startDirective(size, clarification) {
    if (clarification)
        return { action: "clarify", reason: "Material ambiguity changes observable behavior or a system boundary" };
    return size === "distributed" || size === "systemic" ? { action: "plan", reason: `${size} impact requires an explicit execution plan` } : { action: "continue", reason: "Local impact does not require a separate planning phase" };
}
