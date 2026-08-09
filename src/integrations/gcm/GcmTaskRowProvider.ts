/*
 * TPS Notebook Navigator - optional GCM task rows for exact visible notes.
 */

import { normalizePath, type App, type TFile } from 'obsidian';
import { TPS_FILES_UPDATED_EVENT } from '../../constants/tpsIdentity';
import type {
    NavigatorProvidedRowCandidate,
    NavigatorRowProvider,
    NavigatorRowProviderContext,
    NavigatorRowProviderQueryContext,
    NavigatorRowProviderOptions,
    NavigatorRowProviderSelection
} from '../../services/rows/types';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS } from '../../services/rows/types';
import { TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT, TPS_GCM_TASK_ROWS_PER_NOTE_MAX, TPS_GCM_TASK_ROWS_PER_NOTE_MIN } from '../../settings/types';
import { showNotice } from '../../utils/noticeUtils';
import {
    isGcmTaskRecord,
    resolveGcmTaskApi,
    resolveGcmTaskCheckboxesApi,
    resolveGcmTaskLinesApi,
    type GcmTaskApiLike,
    type GcmTaskCheckboxesApiLike,
    type GcmTaskLinesApiLike,
    type GcmTaskMenuLike,
    type GcmTaskMutationResultLike,
    type GcmTaskRecordLike,
    type GcmTaskRefLike
} from './gcmTaskApi';

export const GCM_TASK_ROW_PROVIDER_ID = 'tps/gcm-tasks';
export const GCM_TASK_ROW_KIND = 'tps/gcm-task';

const GCM_QUERY_CONCURRENCY = 8;
const CANCELLED_GCM_QUERY = Symbol('cancelled-gcm-query');
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

async function awaitGcmBatch<T>(pending: Promise<T>, signal: AbortSignal): Promise<T | typeof CANCELLED_GCM_QUERY> {
    if (signal.aborted) {
        return CANCELLED_GCM_QUERY;
    }
    let resolveCancellation: (() => void) | null = null;
    const cancellation = new Promise<typeof CANCELLED_GCM_QUERY>(resolve => {
        resolveCancellation = () => resolve(CANCELLED_GCM_QUERY);
    });
    const cancel = () => resolveCancellation?.();
    signal.addEventListener('abort', cancel, { once: true });
    try {
        const result = await Promise.race([pending, cancellation]);
        return signal.aborted ? CANCELLED_GCM_QUERY : result;
    } finally {
        signal.removeEventListener('abort', cancel);
        resolveCancellation = null;
    }
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

function canMutateTaskCheckbox(api: GcmTaskApiLike | null, checkboxApi: GcmTaskCheckboxesApiLike | null): boolean {
    return typeof api?.setCompletion === 'function' || (typeof api?.setCheckbox === 'function' && checkboxApi !== null);
}

function canBuildTaskContextMenu(api: GcmTaskApiLike | null, taskLinesApi: GcmTaskLinesApiLike | null): boolean {
    return typeof api?.parseLine === 'function' && taskLinesApi !== null;
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
        context: NavigatorRowProviderQueryContext,
        rawOptions: NavigatorRowProviderOptions
    ): Promise<readonly NavigatorProvidedRowCandidate[]> {
        const { signal } = context;
        if (signal.aborted) {
            return [];
        }

        const options = readOptions(rawOptions);
        if (!options.enabled) {
            return [];
        }

        const paths = normalizeVisiblePaths(context.scope.visibleFilePaths).filter(isMarkdownPath);
        if (paths.length === 0 || signal.aborted) {
            return [];
        }

        const api = resolveGcmTaskApi(context.app);
        if (signal.aborted) {
            return [];
        }
        if (!api) {
            this.clearCache();
            return [];
        }
        if (this.apiIdentity !== api) {
            if (signal.aborted) {
                return [];
            }
            this.clearCache();
            this.apiIdentity = api;
        }

        const cacheOptionsKey = `${options.includeCompleted}:${options.maxRowsPerFile}`;
        if (this.cacheOptionsKey !== cacheOptionsKey) {
            if (signal.aborted) {
                return [];
            }
            this.resetTaskCache();
            this.cacheOptionsKey = cacheOptionsKey;
        }

        const requestEpoch = this.cacheEpoch;
        const currentScopeState = this.scopeStates.get(context.scope);
        const scopeState = currentScopeState?.epoch === requestEpoch ? currentScopeState : null;
        const tasksForRequest = new Map<string, readonly GcmTaskRecordLike[]>();
        const stagedTasksByPath = new Map<string, readonly GcmTaskRecordLike[]>();
        const cachedPathsToTouch = new Set<string>();
        const requestGenerations = new Map<string, number>();
        const allPathsToRead: { path: string; generation: number }[] = [];
        for (const path of paths) {
            const generation = this.pathGenerations.get(path) ?? 0;
            requestGenerations.set(path, generation);
            if (!this.dirtyPaths.has(path) && scopeState?.scannedPaths.has(path)) {
                tasksForRequest.set(path, scopeState.tasksByPath.get(path) ?? []);
                continue;
            }
            const cached = this.dirtyPaths.has(path) ? undefined : this.tasksByPath.get(path);
            if (cached) {
                tasksForRequest.set(path, cached);
                cachedPathsToTouch.add(path);
                continue;
            }
            allPathsToRead.push({ path, generation });
        }
        const pathsToRead = allPathsToRead.slice(0, GCM_TASK_ROW_QUERY_PATHS_PER_PASS);
        let failedPathCount = 0;

        if (pathsToRead.length > 0) {
            let firstFailure: unknown = null;
            let successfulPathCount = 0;
            const failedRequests: { path: string; generation: number }[] = [];
            for (let offset = 0; offset < pathsToRead.length; offset += GCM_QUERY_CONCURRENCY) {
                if (signal.aborted) {
                    return [];
                }
                const batchPaths = pathsToRead.slice(offset, offset + GCM_QUERY_CONCURRENCY);
                const settled = await awaitGcmBatch(
                    Promise.allSettled(
                        batchPaths.map(async request => ({
                            ...request,
                            records: await api.list({
                                paths: [request.path],
                                includeCompleted: options.includeCompleted,
                                maxResults: options.maxRowsPerFile
                            })
                        }))
                    ),
                    signal
                );
                if (settled === CANCELLED_GCM_QUERY || signal.aborted) {
                    return [];
                }

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
                    const tasks = (Array.isArray(result.value.records) ? result.value.records : [])
                        .filter(isGcmTaskRecord)
                        .filter(record => normalizePath(record.path) === result.value.path)
                        .map(record => ({ ...record, path: result.value.path }))
                        .filter(record => options.includeCompleted || !record.isComplete)
                        .sort(compareTasks)
                        .slice(0, options.maxRowsPerFile);
                    tasksForRequest.set(result.value.path, tasks);
                    stagedTasksByPath.set(result.value.path, tasks);
                });
            }

            if (signal.aborted) {
                return [];
            }
            if (firstFailure !== null && successfulPathCount === 0 && tasksForRequest.size === 0) {
                throw firstFailure instanceof Error ? firstFailure : new Error('GCM task query failed');
            }
            failedRequests.forEach(failedRequest => {
                tasksForRequest.set(failedRequest.path, []);
                stagedTasksByPath.set(failedRequest.path, []);
            });
        }

        if (signal.aborted || this.cacheEpoch !== requestEpoch) {
            return [];
        }

        const activeTasksForRequest = new Map<string, readonly GcmTaskRecordLike[]>();
        const committedScopeState = this.getScopeState(context.scope);
        for (const path of paths) {
            const tasks = tasksForRequest.get(path);
            const requestGeneration = requestGenerations.get(path);
            if (
                !tasks ||
                requestGeneration === undefined ||
                (this.pathGenerations.get(path) ?? 0) !== requestGeneration ||
                (this.dirtyPaths.has(path) && !stagedTasksByPath.has(path))
            ) {
                continue;
            }

            if (cachedPathsToTouch.has(path)) {
                if (this.tasksByPath.get(path) !== tasks) {
                    continue;
                }
                this.cacheTasks(path, tasks);
            }
            if (stagedTasksByPath.has(path)) {
                this.cacheTasks(path, tasks);
                this.dirtyPaths.delete(path);
            }
            committedScopeState.scannedPaths.add(path);
            committedScopeState.tasksByPath.set(path, tasks);
            activeTasksForRequest.set(path, tasks);
        }

        if (signal.aborted) {
            return [];
        }
        if (failedPathCount > 0) {
            console.warn('[TPS Notebook Navigator] Some GCM task paths could not be queried', {
                failedPathCount,
                requestedPathCount: pathsToRead.length
            });
        }

        const rows: NavigatorProvidedRowCandidate[] = [];
        const canMutateCheckbox = canMutateTaskCheckbox(api, resolveGcmTaskCheckboxesApi(context.app));
        const hasContextMenu = canBuildTaskContextMenu(api, resolveGcmTaskLinesApi(context.app));
        // Fill one task depth across every note before taking the next task
        // from any note. This keeps a task-heavy note from consuming the
        // global provider ceiling and making later notes disappear entirely.
        for (let taskIndex = 0; taskIndex < options.maxRowsPerFile && rows.length < NAVIGATOR_ROW_PROVIDER_MAX_ROWS; taskIndex += 1) {
            for (const path of paths) {
                const task = activeTasksForRequest.get(path)?.[taskIndex];
                if (!task) {
                    continue;
                }
                rows.push(this.toRow(context.app, task, canMutateCheckbox, hasContextMenu));
                if (rows.length >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
                    break;
                }
            }
        }

        if (!signal.aborted && rows.length < NAVIGATOR_ROW_PROVIDER_MAX_ROWS && allPathsToRead.length > pathsToRead.length) {
            this.scheduleProgressiveRefresh();
        }

        return signal.aborted ? [] : rows;
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
        let observedCheckboxApi = resolveGcmTaskCheckboxesApi(context.app);
        let observedTaskLinesApi = resolveGcmTaskLinesApi(context.app);
        let observedCanMutate = canMutateTaskCheckbox(observedApi, observedCheckboxApi);
        let observedHasContextMenu = canBuildTaskContextMenu(observedApi, observedTaskLinesApi);
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
            const nextCheckboxApi = resolveGcmTaskCheckboxesApi(context.app);
            const nextTaskLinesApi = resolveGcmTaskLinesApi(context.app);
            const nextCanMutate = canMutateTaskCheckbox(nextApi, nextCheckboxApi);
            const nextHasContextMenu = canBuildTaskContextMenu(nextApi, nextTaskLinesApi);
            if (
                nextApi === observedApi &&
                nextCheckboxApi === observedCheckboxApi &&
                nextTaskLinesApi === observedTaskLinesApi &&
                nextCanMutate === observedCanMutate &&
                nextHasContextMenu === observedHasContextMenu
            ) {
                return;
            }
            observedApi = nextApi;
            observedCheckboxApi = nextCheckboxApi;
            observedTaskLinesApi = nextTaskLinesApi;
            observedCanMutate = nextCanMutate;
            observedHasContextMenu = nextHasContextMenu;
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

    private toRow(app: App, task: GcmTaskRecordLike, canMutateCheckbox: boolean, hasContextMenu: boolean): NavigatorProvidedRowCandidate {
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
                  const currentCheckboxApi = resolveGcmTaskCheckboxesApi(app);
                  if (!currentApi || !canMutateTaskCheckbox(currentApi, currentCheckboxApi)) {
                      throw new Error('TPS Global Context Menu task mutation is unavailable.');
                  }
                  let result: GcmTaskMutationResultLike;
                  if (currentApi.setCompletion) {
                      result = await currentApi.setCompletion(ref, checked);
                  } else if (currentApi.setCheckbox && currentCheckboxApi) {
                      result = await currentApi.setCheckbox(ref, currentCheckboxApi.stateForStatus(checked ? 'complete' : 'todo'));
                  } else {
                      throw new Error('TPS Global Context Menu task mutation is unavailable.');
                  }
                  if (!result || result.ok !== true) {
                      throw new Error(result?.error || 'TPS Global Context Menu could not update the task.');
                  }
                  let effectiveTask = isGcmTaskRecord(result.task) ? result.task : null;
                  if (!effectiveTask && typeof currentApi.get === 'function') {
                      effectiveTask = await currentApi.get(ref);
                  }
                  if (!effectiveTask || effectiveTask.isComplete !== checked) {
                      throw new Error('TPS Global Context Menu returned an unexpected task completion state.');
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
            properties: {
                tags: Object.freeze([...task.tags]),
                ...task.fields,
                status: task.status
            },
            indicator: {
                type: 'checkbox',
                checked: task.isComplete,
                marker: task.marker || task.checkbox,
                onChange: onCheckboxChange
            },
            ...(hasContextMenu
                ? {
                      contextMenu: (menu: GcmTaskMenuLike) => {
                          this.addTaskContextMenuItems(app, task, {
                              addItem: callback => menu.addItem(callback),
                              addSeparator: () => menu.addSeparator()
                          });
                      }
                  }
                : {}),
            activate: async () => this.activateTask(app, ref)
        };
    }

    /** Resolves every foreign capability again when the user opens the menu. */
    private addTaskContextMenuItems(app: App, task: GcmTaskRecordLike, menu: GcmTaskMenuLike): void {
        const currentApi = resolveGcmTaskApi(app);
        const currentTaskLinesApi = resolveGcmTaskLinesApi(app);
        if (!canBuildTaskContextMenu(currentApi, currentTaskLinesApi) || !currentApi?.parseLine || !currentTaskLinesApi) {
            return;
        }

        const normalizedPath = normalizePath(task.path);
        const latestCachedTasks = this.tasksByPath.get(normalizedPath);
        const latestKnownTask =
            latestCachedTasks?.find(candidate => candidate.lineNumber === task.lineNumber) ?? (latestCachedTasks ? null : task);
        if (!latestKnownTask) {
            return;
        }

        let currentTask: GcmTaskRecordLike | null;
        try {
            currentTask = currentApi.parseLine(latestKnownTask.path, latestKnownTask.lineNumber, latestKnownTask.rawLine);
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM task row could not be re-resolved for its context menu', {
                sourcePath: latestKnownTask.path,
                lineNumber: latestKnownTask.lineNumber,
                error
            });
            return;
        }
        if (
            !isGcmTaskRecord(currentTask) ||
            normalizePath(currentTask.path) !== normalizedPath ||
            currentTask.lineNumber !== latestKnownTask.lineNumber
        ) {
            return;
        }

        const file = app.vault.getFileByPath(normalizePath(currentTask.path));
        if (!isMarkdownFile(file)) {
            return;
        }

        try {
            currentTaskLinesApi.addMenuItems(
                menu,
                {
                    file,
                    lineNumber: currentTask.lineNumber + 1,
                    lineIndex: currentTask.lineNumber,
                    rawLine: currentTask.rawLine,
                    title: currentTask.title,
                    checkboxToken: currentTask.checkbox,
                    isCalendarTask: false,
                    calendarAllDay: false
                },
                { includeTags: true }
            );
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM task row context menu could not be built', {
                sourcePath: currentTask.path,
                lineNumber: currentTask.lineNumber,
                error
            });
        }
    }

    private async activateTask(app: App, ref: GcmTaskRefLike): Promise<void> {
        try {
            const currentApi = resolveGcmTaskApi(app);
            if (!currentApi) {
                throw new Error('TPS Global Context Menu task navigation is unavailable.');
            }

            let currentRef = ref;
            if (typeof currentApi.get === 'function') {
                const currentTask = await currentApi.get(ref);
                if (!isGcmTaskRecord(currentTask) || normalizePath(currentTask.path) !== normalizePath(ref.path)) {
                    throw new Error('The task is no longer available at its current location.');
                }
                if (resolveGcmTaskApi(app) !== currentApi) {
                    throw new Error('TPS Global Context Menu changed while the task was being resolved.');
                }
                currentRef = currentTask;
            }

            if ((await currentApi.focus(currentRef)) !== true) {
                throw new Error('TPS Global Context Menu could not focus the task.');
            }
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM task row activation failed', {
                sourcePath: ref.path,
                lineNumber: ref.lineNumber,
                error
            });
            showNotice('Could not open this item at its current location.', { variant: 'warning' });
        }
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
