/*
 * TPS Notebook Navigator - optional GCM task rows for exact visible notes.
 */

import { normalizePath, type App, type TFile } from 'obsidian';
import { TPS_FILES_UPDATED_EVENT } from '../../constants/tpsIdentity';
import type {
    NavigatorProvidedRowCandidate,
    NavigatorRowProvider,
    NavigatorRowProviderContext,
    NavigatorRowProviderOptions,
    NavigatorRowProviderSelection
} from '../../services/rows/types';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS } from '../../services/rows/types';
import { TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT, TPS_GCM_TASK_ROWS_PER_NOTE_MAX, TPS_GCM_TASK_ROWS_PER_NOTE_MIN } from '../../settings/types';
import { isGcmTaskRecord, resolveGcmTaskApi, type GcmTaskRecordLike, type GcmTaskRefLike } from './gcmTaskApi';

export const GCM_TASK_ROW_PROVIDER_ID = 'tps/gcm-tasks';
export const GCM_TASK_ROW_KIND = 'tps/gcm-task';

const GCM_QUERY_CONCURRENCY = 8;
export const GCM_TASK_ROW_QUERY_PATHS_PER_PASS = 64;
export const GCM_TASK_ROW_CACHE_MAX_PATHS = 512;
export const GCM_TASK_ROW_METADATA_MAX_PATHS = 2_048;

export interface GcmTaskRowProviderOptions {
    enabled: boolean;
    includeCompleted?: boolean;
    maxRowsPerFile?: number;
}

interface EventBusLike {
    on(name: string, callback: (...args: unknown[]) => void): unknown;
    offref?(ref: unknown): void;
}

interface GcmTaskRowScopeState {
    epoch: number;
    scannedPaths: Set<string>;
    tasksByPath: Map<string, readonly GcmTaskRecordLike[]>;
}

function normalizeVisiblePaths(paths: readonly string[]): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const rawPath of paths) {
        const path = normalizePath(String(rawPath ?? '').trim());
        if (!path || seen.has(path)) {
            continue;
        }
        seen.add(path);
        normalized.push(path);
    }
    return normalized;
}

function isMarkdownPath(path: string): boolean {
    return path.toLocaleLowerCase().endsWith('.md');
}

function readOptions(options: NavigatorRowProviderOptions): Required<GcmTaskRowProviderOptions> {
    const rawLimit = Number(options.maxRowsPerFile);
    return {
        enabled: options.enabled === true,
        includeCompleted: options.includeCompleted === true,
        maxRowsPerFile: Number.isFinite(rawLimit)
            ? Math.min(TPS_GCM_TASK_ROWS_PER_NOTE_MAX, Math.max(TPS_GCM_TASK_ROWS_PER_NOTE_MIN, Math.floor(rawLimit)))
            : TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT
    };
}

function getEventPaths(payload: unknown): string[] {
    const rawPaths = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as { paths?: unknown }).paths)
          ? (payload as { paths: unknown[] }).paths
          : [];
    return normalizeVisiblePaths(rawPaths.map(path => String(path ?? '')));
}

function isMarkdownFile(value: unknown): value is TFile {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const file = value as { path?: unknown; extension?: unknown };
    return (
        typeof file.path === 'string' &&
        file.path.trim().length > 0 &&
        typeof file.extension === 'string' &&
        file.extension.toLocaleLowerCase() === 'md'
    );
}

function compareTasks(left: GcmTaskRecordLike, right: GcmTaskRecordLike): number {
    return left.lineNumber - right.lineNumber || left.title.localeCompare(right.title);
}

export function createGcmTaskRowProviderSelection(options: GcmTaskRowProviderOptions): NavigatorRowProviderSelection {
    return {
        enabledProviderIds: options.enabled ? [GCM_TASK_ROW_PROVIDER_ID] : [],
        optionsByProviderId: {
            [GCM_TASK_ROW_PROVIDER_ID]: options as unknown as NavigatorRowProviderOptions
        }
    };
}

export class GcmTaskRowProvider implements NavigatorRowProvider {
    readonly id = GCM_TASK_ROW_PROVIDER_ID;

    private readonly tasksByPath = new Map<string, readonly GcmTaskRecordLike[]>();
    private readonly dirtyPaths = new Set<string>();
    private readonly pathGenerations = new Map<string, number>();
    private readonly scopeStates = new WeakMap<object, GcmTaskRowScopeState>();
    private readonly progressiveInvalidationListeners = new Set<() => void>();
    private progressiveRefreshTimer: number | null = null;
    private apiIdentity: object | null = null;
    private cacheOptionsKey: string | null = null;
    private cacheEpoch = 0;

    async getRows(
        context: NavigatorRowProviderContext,
        rawOptions: NavigatorRowProviderOptions
    ): Promise<readonly NavigatorProvidedRowCandidate[]> {
        const options = readOptions(rawOptions);
        if (!options.enabled) {
            return [];
        }

        const paths = normalizeVisiblePaths(context.scope.visibleFilePaths).filter(isMarkdownPath);
        if (paths.length === 0) {
            return [];
        }

        const api = resolveGcmTaskApi(context.app);
        if (!api) {
            this.clearCache();
            return [];
        }
        if (this.apiIdentity !== api) {
            this.clearCache();
            this.apiIdentity = api;
        }

        const cacheOptionsKey = `${options.includeCompleted}:${options.maxRowsPerFile}`;
        if (this.cacheOptionsKey !== cacheOptionsKey) {
            this.resetTaskCache();
            this.cacheOptionsKey = cacheOptionsKey;
        }

        const requestEpoch = this.cacheEpoch;
        const scopeState = this.getScopeState(context.scope);
        const tasksForRequest = new Map<string, readonly GcmTaskRecordLike[]>();
        const allPathsToRead: { path: string; generation: number }[] = [];
        for (const path of paths) {
            if (!this.dirtyPaths.has(path) && scopeState.scannedPaths.has(path)) {
                tasksForRequest.set(path, scopeState.tasksByPath.get(path) ?? []);
                continue;
            }
            const cached = this.dirtyPaths.has(path) ? undefined : this.readCachedTasks(path);
            if (cached) {
                tasksForRequest.set(path, cached);
                scopeState.scannedPaths.add(path);
                scopeState.tasksByPath.set(path, cached);
                continue;
            }
            allPathsToRead.push({ path, generation: this.pathGenerations.get(path) ?? 0 });
        }
        const pathsToRead = allPathsToRead.slice(0, GCM_TASK_ROW_QUERY_PATHS_PER_PASS);

        if (pathsToRead.length > 0) {
            let firstFailure: unknown = null;
            let failedPathCount = 0;
            let successfulPathCount = 0;
            const failedRequests: { path: string; generation: number }[] = [];
            for (let offset = 0; offset < pathsToRead.length; offset += GCM_QUERY_CONCURRENCY) {
                const batchPaths = pathsToRead.slice(offset, offset + GCM_QUERY_CONCURRENCY);
                const settled = await Promise.allSettled(
                    batchPaths.map(async request => ({
                        ...request,
                        records: await api.list({
                            paths: [request.path],
                            includeCompleted: options.includeCompleted,
                            maxResults: options.maxRowsPerFile
                        })
                    }))
                );

                settled.forEach((result, resultIndex) => {
                    if (result.status === 'rejected') {
                        firstFailure ??= result.reason;
                        failedPathCount += 1;
                        const failedRequest = batchPaths[resultIndex];
                        if (failedRequest) {
                            failedRequests.push(failedRequest);
                        }
                        return;
                    }
                    successfulPathCount += 1;
                    if (
                        this.cacheEpoch !== requestEpoch ||
                        (this.pathGenerations.get(result.value.path) ?? 0) !== result.value.generation
                    ) {
                        return;
                    }
                    const tasks = (Array.isArray(result.value.records) ? result.value.records : [])
                        .filter(isGcmTaskRecord)
                        .filter(record => normalizePath(record.path) === result.value.path)
                        .map(record => ({ ...record, path: result.value.path }))
                        .filter(record => options.includeCompleted || !record.isComplete)
                        .sort(compareTasks)
                        .slice(0, options.maxRowsPerFile);
                    tasksForRequest.set(result.value.path, tasks);
                    scopeState.scannedPaths.add(result.value.path);
                    scopeState.tasksByPath.set(result.value.path, tasks);
                    this.cacheTasks(result.value.path, tasks);
                    this.dirtyPaths.delete(result.value.path);
                });
            }

            if (firstFailure !== null && successfulPathCount === 0 && tasksForRequest.size === 0) {
                throw firstFailure instanceof Error ? firstFailure : new Error('GCM task query failed');
            }
            failedRequests.forEach(failedRequest => {
                if (this.cacheEpoch !== requestEpoch || (this.pathGenerations.get(failedRequest.path) ?? 0) !== failedRequest.generation) {
                    return;
                }
                tasksForRequest.set(failedRequest.path, []);
                scopeState.scannedPaths.add(failedRequest.path);
                scopeState.tasksByPath.set(failedRequest.path, []);
                this.cacheTasks(failedRequest.path, []);
                this.dirtyPaths.delete(failedRequest.path);
            });
            if (failedPathCount > 0) {
                console.warn('[TPS Notebook Navigator] Some GCM task paths could not be queried', {
                    failedPathCount,
                    requestedPathCount: pathsToRead.length
                });
            }
        }

        const rows: NavigatorProvidedRowCandidate[] = [];
        // Fill one task depth across every note before taking the next task
        // from any note. This keeps a task-heavy note from consuming the
        // global provider ceiling and making later notes disappear entirely.
        for (let taskIndex = 0; taskIndex < options.maxRowsPerFile && rows.length < NAVIGATOR_ROW_PROVIDER_MAX_ROWS; taskIndex += 1) {
            for (const path of paths) {
                const task = tasksForRequest.get(path)?.[taskIndex];
                if (!task) {
                    continue;
                }
                rows.push(this.toRow(context.app, task, typeof api.setCheckbox === 'function'));
                if (rows.length >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
                    break;
                }
            }
        }

        if (rows.length < NAVIGATOR_ROW_PROVIDER_MAX_ROWS && allPathsToRead.length > pathsToRead.length) {
            this.scheduleProgressiveRefresh();
        }

        return rows;
    }

    subscribe(
        context: NavigatorRowProviderContext,
        rawOptions: NavigatorRowProviderOptions,
        onInvalidate: () => void
    ): (() => void) | void {
        if (!readOptions(rawOptions).enabled) {
            return;
        }

        const visiblePaths = new Set(normalizeVisiblePaths(context.scope.visibleFilePaths));
        if (visiblePaths.size === 0) {
            return;
        }

        const workspaceEvents = context.app.workspace as unknown as EventBusLike;
        const vaultEvents = context.app.vault as unknown as EventBusLike;
        const subscriptions: { bus: EventBusLike; ref: unknown }[] = [];
        let observedApi = resolveGcmTaskApi(context.app);
        let observedCanMutate = typeof observedApi?.setCheckbox === 'function';
        this.progressiveInvalidationListeners.add(onInvalidate);
        const subscribe = (bus: EventBusLike, eventName: string, callback: (...args: unknown[]) => void) => {
            const ref = bus.on(eventName, callback);
            subscriptions.push({ bus, ref });
        };
        const invalidatePaths = (paths: readonly string[]) => {
            const relevant = paths.length === 0 ? Array.from(visiblePaths) : paths.filter(path => visiblePaths.has(path));
            if (relevant.length === 0) {
                return;
            }
            relevant.forEach(path => this.markPathDirty(path));
            onInvalidate();
        };

        subscribe(workspaceEvents, TPS_FILES_UPDATED_EVENT, payload => invalidatePaths(getEventPaths(payload)));
        subscribe(workspaceEvents, 'layout-change', () => {
            const nextApi = resolveGcmTaskApi(context.app);
            const nextCanMutate = typeof nextApi?.setCheckbox === 'function';
            if (nextApi === observedApi && nextCanMutate === observedCanMutate) {
                return;
            }
            observedApi = nextApi;
            observedCanMutate = nextCanMutate;
            this.clearCache();
            onInvalidate();
        });
        subscribe(vaultEvents, 'create', file => {
            if (isMarkdownFile(file)) {
                invalidatePaths([normalizePath(file.path)]);
            }
        });
        subscribe(vaultEvents, 'modify', file => {
            if (isMarkdownFile(file)) {
                invalidatePaths([normalizePath(file.path)]);
            }
        });
        subscribe(vaultEvents, 'delete', file => {
            if (!isMarkdownFile(file)) {
                return;
            }
            const path = normalizePath(file.path);
            this.tasksByPath.delete(path);
            invalidatePaths([path]);
        });
        subscribe(vaultEvents, 'rename', (file, oldPath) => {
            const normalizedOldPath = typeof oldPath === 'string' ? normalizePath(oldPath) : '';
            if (normalizedOldPath) {
                this.tasksByPath.delete(normalizedOldPath);
            }
            const nextPath = isMarkdownFile(file) ? normalizePath(file.path) : '';
            invalidatePaths([normalizedOldPath, nextPath].filter(Boolean));
        });

        return () => {
            subscriptions.forEach(({ bus, ref }) => bus.offref?.(ref));
            this.progressiveInvalidationListeners.delete(onInvalidate);
            if (this.progressiveInvalidationListeners.size === 0 && this.progressiveRefreshTimer !== null) {
                window.clearTimeout(this.progressiveRefreshTimer);
                this.progressiveRefreshTimer = null;
            }
        };
    }

    private toRow(app: App, task: GcmTaskRecordLike, canMutateCheckbox: boolean): NavigatorProvidedRowCandidate {
        const ref: GcmTaskRefLike = {
            path: task.path,
            lineNumber: task.lineNumber,
            rawLine: task.rawLine,
            title: task.title
        };
        const oneBasedLine = task.lineNumber + 1;
        const onCheckboxChange = canMutateCheckbox
            ? async (checked: boolean) => {
                  const currentApi = resolveGcmTaskApi(app);
                  if (!currentApi?.setCheckbox) {
                      throw new Error('TPS Global Context Menu task mutation is unavailable.');
                  }
                  const result = await currentApi.setCheckbox(ref, checked ? 'x' : ' ');
                  if (!result || result.ok !== true) {
                      throw new Error(result?.error || 'TPS Global Context Menu could not update the task.');
                  }
              }
            : undefined;

        return {
            id: `${task.path}:${task.lineNumber}`,
            kind: GCM_TASK_ROW_KIND,
            label: task.title || 'Untitled task',
            secondaryLabel: `${task.path} · line ${oneBasedLine}`,
            tooltip: `${task.path}:${oneBasedLine}`,
            sourcePath: task.path,
            sourceLineNumber: task.lineNumber,
            indicator: {
                type: 'checkbox',
                checked: task.isComplete,
                marker: task.marker || task.checkbox,
                onChange: onCheckboxChange
            },
            activate: async () => {
                const currentApi = resolveGcmTaskApi(app);
                if (currentApi) {
                    await currentApi.focus(ref);
                }
            }
        };
    }

    private clearCache(): void {
        this.resetTaskCache();
        this.apiIdentity = null;
        this.cacheOptionsKey = null;
    }

    private getScopeState(scope: object): GcmTaskRowScopeState {
        const current = this.scopeStates.get(scope);
        if (current?.epoch === this.cacheEpoch) {
            return current;
        }
        const next: GcmTaskRowScopeState = {
            epoch: this.cacheEpoch,
            scannedPaths: new Set<string>(),
            tasksByPath: new Map<string, readonly GcmTaskRecordLike[]>()
        };
        this.scopeStates.set(scope, next);
        return next;
    }

    private scheduleProgressiveRefresh(): void {
        if (this.progressiveRefreshTimer !== null || this.progressiveInvalidationListeners.size === 0) {
            return;
        }
        this.progressiveRefreshTimer = window.setTimeout(() => {
            this.progressiveRefreshTimer = null;
            this.progressiveInvalidationListeners.forEach(listener => listener());
        }, 0);
    }

    private resetTaskCache(): void {
        this.cacheEpoch += 1;
        this.tasksByPath.clear();
        this.dirtyPaths.clear();
        this.pathGenerations.clear();
    }

    private markPathDirty(path: string): void {
        if (!this.pathGenerations.has(path) && this.pathGenerations.size >= GCM_TASK_ROW_METADATA_MAX_PATHS) {
            // A whole-cache epoch reset safely invalidates any outstanding
            // request before pruning accumulated path generations.
            this.resetTaskCache();
        }
        this.dirtyPaths.add(path);
        this.pathGenerations.set(path, (this.pathGenerations.get(path) ?? 0) + 1);
    }

    private readCachedTasks(path: string): readonly GcmTaskRecordLike[] | undefined {
        const tasks = this.tasksByPath.get(path);
        if (!tasks) {
            return undefined;
        }
        this.tasksByPath.delete(path);
        this.tasksByPath.set(path, tasks);
        return tasks;
    }

    private cacheTasks(path: string, tasks: readonly GcmTaskRecordLike[]): void {
        this.tasksByPath.delete(path);
        this.tasksByPath.set(path, tasks);
        while (this.tasksByPath.size > GCM_TASK_ROW_CACHE_MAX_PATHS) {
            const oldestPath = this.tasksByPath.keys().next().value;
            if (!oldestPath) {
                break;
            }
            this.tasksByPath.delete(oldestPath);
        }
    }
}
