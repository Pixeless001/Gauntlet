import type { ExecutionEnvironment } from "../execution/types.js";

export interface SearchResult { path: string; line?: number; excerpt: string }
export interface SearchProvider { available(): boolean; search(query: string, options?: { scope?: string; limit?: number }): Promise<SearchResult[]> }
export interface BrowserEvidence { text: string[]; controls: { role: string; name: string }[]; screenshot?: string; consoleFailures: string[]; networkFailures: string[] }
export interface BrowserProvider { available(): boolean; open(url: string): Promise<void>; inspect(): Promise<BrowserEvidence>; interact(action: { kind: string; target: string; value?: string }): Promise<BrowserEvidence> }
export interface ReferenceProvider { search(domain: string, query: string, limit: number): Promise<{ heading: string; content: string }[]> }
export interface DelegatedTask { goal: string; acceptanceCriteria: string[]; constraints: string[]; scope: string[]; relevantFiles: string[]; activeRules: string[]; validatedState?: string[]; currentApproach?: string; evidenceRefs?: string[] }
export interface DelegatedResult { status: "complete" | "blocked"; result: string; evidence: string[]; changedFiles: string[]; blocker?: string }
export interface DelegationProvider { available(): boolean; supportsCallback(): boolean; dispatch(task: DelegatedTask): Promise<DelegatedResult> }
export interface ExecutionProvider { environment(root: string): ExecutionEnvironment }
