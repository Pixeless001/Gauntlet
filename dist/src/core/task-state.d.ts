import { z } from "zod";
import { type Finding, type StoredTaskActivity, type TaskContract } from "./events.js";
import type { RepositoryFact } from "../repo/memory.js";
import type { ConventionFact } from "../repo/conventions.js";
import type { RepoIndex } from "../repo/index.js";
import { type InterventionBudget } from "./policy.js";
import type { SkillName } from "./skills.js";
import type { SearchObservation } from "../context/governor.js";
import { type UncertaintyKind, type UncertaintyState } from "../control/uncertainty.js";
import type { SelectionTrace } from "../control/selector.js";
import type { BoundaryStrength, ContextPressure, ControlDecision, TaskSize } from "../control/types.js";
import type { ExecutionCheckpoint } from "../execution-state/checkpoints.js";
import type { ExecutionEvent } from "../execution-state/events.js";
import type { ProgressStatus } from "../execution-state/progress.js";
import type { ProofKind } from "../verify/proof-selector.js";
import type { RepositoryRule } from "../repo/rules.js";
import type { CurrentValidWorld } from "../work/types.js";
export interface FileDelta {
    path: string;
    added: number;
    removed: number;
}
export interface TestSignature {
    assertions: string[];
    skipped: number;
}
export interface FileFingerprint {
    hash: string;
    lineHashes: string[];
}
export interface FileObservation {
    path: string;
    hash: string;
    lastObserved: number;
    relevantSymbols: string[];
}
export interface Baseline {
    head: string | null;
    status: string[];
    dependencies: string[];
    files: Record<string, FileFingerprint>;
    tests: Record<string, TestSignature>;
    publicExports?: Record<string, string[]>;
    index?: RepoIndex;
}
export interface ControlState {
    uncertainty: UncertaintyState;
    impact: {
        size: TaskSize;
        owners: string[];
        dependencies: string[];
        callers: string[];
        tests: string[];
        packageCrossings: string[];
        publicSurface: string[];
        confidence: "unknown" | "low" | "medium" | "high";
    };
    progress: {
        status: ProgressStatus;
        reason: string;
        unresolved: UncertaintyKind[];
        proofDelta: number;
        failureSignature?: string;
        repeatedTargets: string[];
        diffLines: number;
        rejectedOverlap: boolean;
    };
    budget: InterventionBudget;
    availableProof: ProofKind[];
    context: {
        pressure: ContextPressure;
        recentCompletedTurns: number[];
        artifactRefs: string[];
    };
    scope: {
        expected: string[];
        actual: string[];
        unexpected: string[];
        hardSignals: string[];
        softSignals: string[];
    };
    capabilities: {
        kind: string;
        source: "repository" | "host" | "installed" | "gauntlet";
        available: boolean;
    }[];
    lifecycle: {
        boundary: BoundaryStrength;
        pressure: ContextPressure;
        lastStableEvent: number;
        corrections: number;
    };
    hysteresis: {
        lastAction?: string;
        stableEvents: number;
        repeatedSignals: number;
    };
    traces: SelectionTrace[];
    decisions: ControlDecision[];
    validatedDecisions: string[];
    currentApproach: string;
    resolvedIssues: string[];
    unresolvedIssues: string[];
    failedApproaches: string[];
    activeSkills: SkillName[];
    lastCompactedActivity: number;
    compactions: number;
    observations: FileObservation[];
    repeatReadsDetected: number;
    searches: SearchObservation[];
    repeatSearchesDetected: number;
    interventionsUsed: number;
    graphExpansions: number;
    externalDocCalls: number;
    browserActivations: number;
    delegations: number;
    exhaustedEscalation: Partial<Record<UncertaintyKind, number>>;
    execution: {
        activeCheckpointId: string;
        checkpoints: ExecutionCheckpoint[];
        events: ExecutionEvent[];
        nextEvent: number;
    };
}
export interface TaskState {
    version: 3;
    id: string;
    repository: string;
    startedAt: string;
    contract: TaskContract;
    clarifications: {
        question: string;
        answer: string;
        at: string;
    }[];
    baseline: Baseline;
    workingSet: string[];
    repositoryFacts: RepositoryFact[];
    conventions?: ConventionFact[];
    rules?: RepositoryRule[];
    conventionMetrics?: {
        hints: number;
        primitives: number;
        interventions: number;
        dependencyConflicts: number;
        duplicates: number;
        architectureBypasses: number;
    };
    activities: StoredTaskActivity[];
    findings: Finding[];
    attempts: number;
    finishedAt?: string;
    control: ControlState;
    world: CurrentValidWorld;
}
export declare const taskStateSchema: z.ZodObject<{
    version: z.ZodLiteral<3>;
    id: z.ZodString;
    repository: z.ZodString;
    startedAt: z.ZodString;
    contract: z.ZodObject<{
        intent: z.ZodString;
        goal: z.ZodString;
        acceptanceCriteria: z.ZodArray<z.ZodString>;
        preservationRequirements: z.ZodArray<z.ZodString>;
        constraints: z.ZodArray<z.ZodString>;
        unknowns: z.ZodArray<z.ZodString>;
        explicitPaths: z.ZodArray<z.ZodString>;
        expectedFrontier: z.ZodArray<z.ZodString>;
        requiredProof: z.ZodArray<z.ZodString>;
        size: z.ZodEnum<{
            distributed: "distributed";
            local: "local";
            systemic: "systemic";
            tiny: "tiny";
        }>;
    }, z.core.$strip>;
    clarifications: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        answer: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>;
    baseline: z.ZodObject<{
        head: z.ZodNullable<z.ZodString>;
        status: z.ZodArray<z.ZodString>;
        dependencies: z.ZodArray<z.ZodString>;
        files: z.ZodRecord<z.ZodString, z.ZodObject<{
            hash: z.ZodString;
            lineHashes: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        tests: z.ZodRecord<z.ZodString, z.ZodObject<{
            assertions: z.ZodArray<z.ZodString>;
            skipped: z.ZodNumber;
        }, z.core.$strip>>;
        publicExports: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
        index: z.ZodOptional<z.ZodUnknown>;
    }, z.core.$strip>;
    workingSet: z.ZodArray<z.ZodString>;
    repositoryFacts: z.ZodArray<z.ZodUnknown>;
    conventions: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    rules: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    conventionMetrics: z.ZodOptional<z.ZodObject<{
        hints: z.ZodNumber;
        primitives: z.ZodNumber;
        interventions: z.ZodNumber;
        dependencyConflicts: z.ZodNumber;
        duplicates: z.ZodNumber;
        architectureBypasses: z.ZodNumber;
    }, z.core.$strip>>;
    activities: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            command: "command";
            decision_signal: "decision_signal";
            diff_change: "diff_change";
            file_read: "file_read";
            file_write: "file_write";
            message: "message";
            search: "search";
            test_result: "test_result";
        }>;
        target: z.ZodOptional<z.ZodString>;
        outcome: z.ZodOptional<z.ZodEnum<{
            fail: "fail";
            pass: "pass";
            unknown: "unknown";
        }>>;
        outputBytes: z.ZodDefault<z.ZodNumber>;
        proofRef: z.ZodOptional<z.ZodString>;
        artifactRef: z.ZodOptional<z.ZodString>;
        report: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                approach_rejected: "approach_rejected";
                cause_validated: "cause_validated";
                hypothesis: "hypothesis";
                implementation_selected: "implementation_selected";
                verification: "verification";
            }>;
            summary: z.ZodString;
            constraints: z.ZodDefault<z.ZodArray<z.ZodString>>;
            relevantFiles: z.ZodDefault<z.ZodArray<z.ZodString>>;
            relevantSymbols: z.ZodDefault<z.ZodArray<z.ZodString>>;
            proofRefs: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    findings: z.ZodArray<z.ZodObject<{
        code: z.ZodString;
        severity: z.ZodEnum<{
            error: "error";
            info: "info";
            warning: "warning";
        }>;
        blocking: z.ZodOptional<z.ZodBoolean>;
        message: z.ZodString;
        proof: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    attempts: z.ZodNumber;
    finishedAt: z.ZodOptional<z.ZodString>;
    control: z.ZodObject<{
        uncertainty: z.ZodObject<{
            api: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            behavior: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            cause: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            intent: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            location: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            performance: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            regression: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            repoFit: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            scope: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
            visual: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
        }, z.core.$strip>;
        impact: z.ZodObject<{
            size: z.ZodEnum<{
                distributed: "distributed";
                local: "local";
                systemic: "systemic";
                tiny: "tiny";
            }>;
            owners: z.ZodArray<z.ZodString>;
            dependencies: z.ZodArray<z.ZodString>;
            callers: z.ZodArray<z.ZodString>;
            tests: z.ZodArray<z.ZodString>;
            packageCrossings: z.ZodArray<z.ZodString>;
            publicSurface: z.ZodArray<z.ZodString>;
            confidence: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
                unknown: "unknown";
            }>;
        }, z.core.$strip>;
        progress: z.ZodObject<{
            status: z.ZodEnum<{
                PROGRESS: "PROGRESS";
                REGRESSED: "REGRESSED";
                STALLED: "STALLED";
            }>;
            reason: z.ZodString;
            unresolved: z.ZodArray<z.ZodEnum<{
                api: "api";
                behavior: "behavior";
                cause: "cause";
                intent: "intent";
                location: "location";
                performance: "performance";
                regression: "regression";
                repoFit: "repoFit";
                scope: "scope";
                visual: "visual";
            }>>;
            proofDelta: z.ZodNumber;
            failureSignature: z.ZodOptional<z.ZodString>;
            repeatedTargets: z.ZodArray<z.ZodString>;
            diffLines: z.ZodNumber;
            rejectedOverlap: z.ZodBoolean;
        }, z.core.$strip>;
        budget: z.ZodObject<{
            interventions: z.ZodNumber;
            compactions: z.ZodNumber;
            expensiveChecks: z.ZodNumber;
            skillInvocations: z.ZodNumber;
            extraLlmCalls: z.ZodLiteral<0>;
        }, z.core.$strip>;
        availableProof: z.ZodArray<z.ZodEnum<{
            browser: "browser";
            contract: "contract";
            diff: "diff";
            graph: "graph";
            installed_api: "installed_api";
            measurement: "measurement";
            repository_rule: "repository_rule";
            reproduction: "reproduction";
            search: "search";
            test: "test";
        }>>;
        context: z.ZodObject<{
            pressure: z.ZodEnum<{
                high: "high";
                low: "low";
                rising: "rising";
                unknown: "unknown";
            }>;
            recentCompletedTurns: z.ZodArray<z.ZodNumber>;
            artifactRefs: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        scope: z.ZodObject<{
            expected: z.ZodArray<z.ZodString>;
            actual: z.ZodArray<z.ZodString>;
            unexpected: z.ZodArray<z.ZodString>;
            hardSignals: z.ZodArray<z.ZodString>;
            softSignals: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
        capabilities: z.ZodArray<z.ZodObject<{
            kind: z.ZodString;
            source: z.ZodEnum<{
                gauntlet: "gauntlet";
                host: "host";
                installed: "installed";
                repository: "repository";
            }>;
            available: z.ZodBoolean;
        }, z.core.$strip>>;
        lifecycle: z.ZodObject<{
            boundary: z.ZodEnum<{
                medium: "medium";
                strong: "strong";
                weak: "weak";
            }>;
            pressure: z.ZodEnum<{
                high: "high";
                low: "low";
                rising: "rising";
                unknown: "unknown";
            }>;
            lastStableEvent: z.ZodNumber;
            corrections: z.ZodNumber;
        }, z.core.$strip>;
        hysteresis: z.ZodObject<{
            lastAction: z.ZodOptional<z.ZodString>;
            stableEvents: z.ZodNumber;
            repeatedSignals: z.ZodNumber;
        }, z.core.$strip>;
        traces: z.ZodArray<z.ZodObject<{
            event: z.ZodNumber;
            trigger: z.ZodString;
            candidates: z.ZodArray<z.ZodString>;
            selected: z.ZodArray<z.ZodString>;
            activations: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                kind: z.ZodEnum<{
                    capability: "capability";
                    context: "context";
                    "graph-expansion": "graph-expansion";
                    proof: "proof";
                    reference: "reference";
                    skill: "skill";
                }>;
                resolves: z.ZodArray<z.ZodEnum<{
                    api: "api";
                    behavior: "behavior";
                    cause: "cause";
                    intent: "intent";
                    location: "location";
                    performance: "performance";
                    regression: "regression";
                    repoFit: "repoFit";
                    scope: "scope";
                    visual: "visual";
                }>>;
                uncertainty: z.ZodEnum<{
                    api: "api";
                    behavior: "behavior";
                    cause: "cause";
                    intent: "intent";
                    location: "location";
                    performance: "performance";
                    regression: "regression";
                    repoFit: "repoFit";
                    scope: "scope";
                    visual: "visual";
                }>;
                level: z.ZodNumber;
                cost: z.ZodEnum<{
                    high: "high";
                    low: "low";
                    medium: "medium";
                    tiny: "tiny";
                }>;
                authority: z.ZodEnum<{
                    cached: "cached";
                    external: "external";
                    local: "local";
                    repository: "repository";
                    runtime: "runtime";
                }>;
                source: z.ZodString;
                reason: z.ZodString;
            }, z.core.$strip>>;
            rejected: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                reason: z.ZodEnum<{
                    budget_exceeded: "budget_exceeded";
                    dominated: "dominated";
                    duplicate: "duplicate";
                    irrelevant: "irrelevant";
                    resolved: "resolved";
                    unavailable: "unavailable";
                }>;
            }, z.core.$strip>>;
            changedState: z.ZodOptional<z.ZodBoolean>;
            proofFound: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        decisions: z.ZodArray<z.ZodObject<{
            event: z.ZodNumber;
            trigger: z.ZodString;
            candidates: z.ZodArray<z.ZodString>;
            rejected: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                reason: z.ZodEnum<{
                    budget_exceeded: "budget_exceeded";
                    dominated: "dominated";
                    duplicate: "duplicate";
                    irrelevant: "irrelevant";
                    resolved: "resolved";
                    unavailable: "unavailable";
                }>;
            }, z.core.$strip>>;
            selected: z.ZodOptional<z.ZodString>;
            pressure: z.ZodObject<{
                uncertainty: z.ZodObject<{
                    api: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    behavior: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    cause: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    intent: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    location: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    performance: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    regression: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    repoFit: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    scope: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                    visual: z.ZodTypeAny<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                }, z.core.$strip>;
                falseActivationCost: z.ZodNumber;
                missedActivationCost: z.ZodNumber;
                budgetRemaining: z.ZodNumber;
                context: z.ZodEnum<{
                    high: "high";
                    low: "low";
                    rising: "rising";
                    unknown: "unknown";
                }>;
            }, z.core.$strip>;
            stateChange: z.ZodArray<z.ZodString>;
            proofGain: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        validatedDecisions: z.ZodArray<z.ZodString>;
        currentApproach: z.ZodString;
        resolvedIssues: z.ZodArray<z.ZodString>;
        unresolvedIssues: z.ZodArray<z.ZodString>;
        failedApproaches: z.ZodArray<z.ZodString>;
        activeSkills: z.ZodArray<z.ZodEnum<{
            implement: "implement";
            investigate: "investigate";
            optimize: "optimize";
            review: "review";
            understand: "understand";
            verify: "verify";
        }>>;
        lastCompactedActivity: z.ZodNumber;
        compactions: z.ZodNumber;
        observations: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            hash: z.ZodString;
            lastObserved: z.ZodNumber;
            relevantSymbols: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        repeatReadsDetected: z.ZodNumber;
        searches: z.ZodArray<z.ZodUnknown>;
        repeatSearchesDetected: z.ZodNumber;
        interventionsUsed: z.ZodNumber;
        graphExpansions: z.ZodNumber;
        externalDocCalls: z.ZodNumber;
        browserActivations: z.ZodNumber;
        delegations: z.ZodNumber;
        exhaustedEscalation: z.ZodRecord<z.ZodString, z.ZodNumber>;
        execution: z.ZodObject<{
            activeCheckpointId: z.ZodString;
            checkpoints: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                parentId: z.ZodOptional<z.ZodString>;
                kind: z.ZodEnum<{
                    decision: "decision";
                    implementation: "implementation";
                    investigation: "investigation";
                    task: "task";
                    understanding: "understanding";
                    verification: "verification";
                }>;
                status: z.ZodEnum<{
                    active: "active";
                    rejected: "rejected";
                    validated: "validated";
                }>;
                summary: z.ZodString;
                constraints: z.ZodArray<z.ZodString>;
                decisions: z.ZodArray<z.ZodString>;
                relevantFiles: z.ZodArray<z.ZodString>;
                relevantSymbols: z.ZodArray<z.ZodString>;
                proofRefs: z.ZodArray<z.ZodString>;
                rejectionReason: z.ZodOptional<z.ZodString>;
                createdFromEvent: z.ZodNumber;
                resolves: z.ZodArray<z.ZodEnum<{
                    api: "api";
                    behavior: "behavior";
                    cause: "cause";
                    intent: "intent";
                    location: "location";
                    performance: "performance";
                    regression: "regression";
                    repoFit: "repoFit";
                    scope: "scope";
                    visual: "visual";
                }>>;
            }, z.core.$strip>>;
            events: z.ZodArray<z.ZodObject<{
                index: z.ZodNumber;
                type: z.ZodEnum<{
                    command: "command";
                    decision_signal: "decision_signal";
                    diff_change: "diff_change";
                    failure: "failure";
                    file_read: "file_read";
                    file_write: "file_write";
                    search: "search";
                    test_result: "test_result";
                }>;
                target: z.ZodOptional<z.ZodString>;
                outcome: z.ZodOptional<z.ZodString>;
                proofRef: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            nextEvent: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>;
    world: z.ZodObject<{
        version: z.ZodLiteral<1>;
        revision: z.ZodNumber;
        contractVersion: z.ZodNumber;
        contract: z.ZodObject<{
            intent: z.ZodString;
            goal: z.ZodString;
            acceptanceCriteria: z.ZodArray<z.ZodString>;
            preservationRequirements: z.ZodArray<z.ZodString>;
            constraints: z.ZodArray<z.ZodString>;
            unknowns: z.ZodArray<z.ZodString>;
            explicitPaths: z.ZodArray<z.ZodString>;
            expectedFrontier: z.ZodArray<z.ZodString>;
            requiredProof: z.ZodArray<z.ZodString>;
            size: z.ZodEnum<{
                distributed: "distributed";
                local: "local";
                systemic: "systemic";
                tiny: "tiny";
            }>;
        }, z.core.$strip>;
        expectedScope: z.ZodDefault<z.ZodArray<z.ZodString>>;
        canonicalRevision: z.ZodNullable<z.ZodString>;
        fingerprint: z.ZodObject<{
            contract: z.ZodString;
            files: z.ZodRecord<z.ZodString, z.ZodString>;
            packages: z.ZodRecord<z.ZodString, z.ZodString>;
            config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            upstream: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            rules: z.ZodString;
            runtime: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>;
        facts: z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodString;
            provenance: z.ZodDefault<z.ZodString>;
            statement: z.ZodString;
            evidenceRefs: z.ZodArray<z.ZodString>;
            fingerprint: z.ZodString;
            version: z.ZodNumber;
            status: z.ZodEnum<{
                stale: "stale";
                validated: "validated";
            }>;
        }, z.core.$strip>>;
        work: z.ZodObject<{
            version: z.ZodNumber;
            nodes: z.ZodRecord<z.ZodString, z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                kind: z.ZodEnum<{
                    evidence: "evidence";
                    implementation: "implementation";
                    inspection: "inspection";
                    local: "local";
                    verification: "verification";
                }>;
                executor: z.ZodEnum<{
                    local: "local";
                    primary: "primary";
                    verifier: "verifier";
                    worker: "worker";
                }>;
                required: z.ZodBoolean;
                state: z.ZodEnum<{
                    BLOCKED: "BLOCKED";
                    CANDIDATE: "CANDIDATE";
                    COLLAPSED: "COLLAPSED";
                    READY: "READY";
                    REJECTED: "REJECTED";
                    RUNNING: "RUNNING";
                    STALE: "STALE";
                    VALIDATED: "VALIDATED";
                }>;
                attempt: z.ZodNumber;
                duration: z.ZodEnum<{
                    long: "long";
                    meaningful: "meaningful";
                    short: "short";
                    tiny: "tiny";
                }>;
                dependencies: z.ZodArray<z.ZodString>;
                validityInputs: z.ZodArray<z.ZodString>;
                writePaths: z.ZodArray<z.ZodString>;
                resolves: z.ZodArray<z.ZodEnum<{
                    api: "api";
                    behavior: "behavior";
                    cause: "cause";
                    intent: "intent";
                    location: "location";
                    performance: "performance";
                    regression: "regression";
                    repoFit: "repoFit";
                    scope: "scope";
                    visual: "visual";
                }>>;
                evidenceRefs: z.ZodArray<z.ZodString>;
                candidate: z.ZodOptional<z.ZodObject<{
                    nodeId: z.ZodString;
                    attempt: z.ZodNumber;
                    executor: z.ZodEnum<{
                        local: "local";
                        primary: "primary";
                        verifier: "verifier";
                        worker: "worker";
                    }>;
                    inputFingerprint: z.ZodString;
                    claims: z.ZodArray<z.ZodString>;
                    artifactRefs: z.ZodArray<z.ZodString>;
                    evidenceRefs: z.ZodArray<z.ZodString>;
                    affectedPaths: z.ZodArray<z.ZodString>;
                    unresolved: z.ZodArray<z.ZodEnum<{
                        api: "api";
                        behavior: "behavior";
                        cause: "cause";
                        intent: "intent";
                        location: "location";
                        performance: "performance";
                        regression: "regression";
                        repoFit: "repoFit";
                        scope: "scope";
                        visual: "visual";
                    }>>;
                    patchRef: z.ZodOptional<z.ZodString>;
                    baseRevision: z.ZodOptional<z.ZodString>;
                    approachFingerprint: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                rejection: z.ZodOptional<z.ZodObject<{
                    constraint: z.ZodString;
                    evidenceRef: z.ZodOptional<z.ZodString>;
                    approachFingerprint: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                collapsedRef: z.ZodOptional<z.ZodString>;
                criticalPath: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        validity: z.ZodObject<{
            version: z.ZodNumber;
            edges: z.ZodArray<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        communication: z.ZodObject<{
            version: z.ZodNumber;
            edges: z.ZodArray<z.ZodObject<{
                from: z.ZodString;
                to: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        uncertainties: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            api: "api";
            behavior: "behavior";
            cause: "cause";
            intent: "intent";
            location: "location";
            performance: "performance";
            regression: "regression";
            repoFit: "repoFit";
            scope: "scope";
            visual: "visual";
        }>>>;
        rules: z.ZodDefault<z.ZodArray<z.ZodString>>;
        legalActions: z.ZodDefault<z.ZodArray<z.ZodString>>;
        capabilities: z.ZodDefault<z.ZodArray<z.ZodString>>;
        ownership: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
        evidenceRefs: z.ZodArray<z.ZodString>;
        decision: z.ZodObject<{
            revision: z.ZodNumber;
            fingerprint: z.ZodString;
            candidates: z.ZodArray<z.ZodString>;
            valid: z.ZodBoolean;
        }, z.core.$strip>;
        appliedEvent: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare function createControlState(contract: TaskContract, rootId?: string, activeSkills?: SkillName[]): ControlState;
export declare function parseTaskState(value: unknown): TaskState;
export declare function createTaskWorld(contract: TaskContract, canonicalRevision?: string | null): CurrentValidWorld;
