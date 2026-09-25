export interface RepositoryLesson {
    scope: string;
    fact: string;
    source: string;
    fingerprint: string;
}
export declare function sourceFingerprint(cwd: string, source: string): Promise<string | null>;
export declare function loadLessons(cwd: string, paths?: string[]): Promise<RepositoryLesson[]>;
export declare function saveLesson(cwd: string, lesson: RepositoryLesson): Promise<void>;
