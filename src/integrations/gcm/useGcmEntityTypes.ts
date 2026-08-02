/*
 * TPS Notebook Navigator - shared React store for the optional GCM entity index.
 *
 * Navigation and list panes share one adapter/query per Obsidian app. This avoids
 * duplicate exact-line index queries while the same store maintains a read-free
 * vault-file catalog for the native file-backed Type collections.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { normalizePath, TFile, type App, type EventRef } from 'obsidian';
import {
    TPS_NAVIGATOR_FILE_TYPES,
    TPS_NAVIGATOR_LINE_TYPES,
    TPS_NAVIGATOR_STRUCTURAL_TYPES,
    isTpsNavigatorFileTypeId,
    type TpsNavigatorFileTypeId,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { GcmEntityTypeIndexAdapter, type GcmEntityActivationResult } from './GcmEntityTypeIndex';
import type { GcmTaskMenuLike } from './gcmTaskApi';
import type { GcmEntityTaskMutationResult } from './GcmEntityTypeIndex';
import {
    TPS_FILES_UPDATED_EVENT,
    TPS_GCM_API_CHANGED_EVENT,
    TPS_GCM_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
} from '../../constants/tpsIdentity';
import {
    buildVaultFileTypesSnapshot,
    buildVaultFileTypesSnapshotFromFiles,
    getTpsNavigatorFileTypeId
} from '../../services/types/vaultFileTypes';

const EMPTY_RECORDS_BY_TYPE = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
const LOADING_FILE_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'loading',
    descriptors: Object.freeze(TPS_NAVIGATOR_FILE_TYPES.map(descriptor => Object.freeze({ ...descriptor, count: 0 }))),
    recordsByType: new Map(TPS_NAVIGATOR_FILE_TYPES.map(descriptor => [descriptor.id, Object.freeze([])])),
    revision: 0,
    message: 'Loading vault file Types…'
});
const LOADING_LINE_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'loading',
    descriptors: Object.freeze(TPS_NAVIGATOR_LINE_TYPES.map(descriptor => Object.freeze({ ...descriptor, count: 0 }))),
    recordsByType: EMPTY_RECORDS_BY_TYPE,
    revision: 0,
    message: 'Loading exact-line items…'
});
const DISABLED_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    recordsByType: EMPTY_RECORDS_BY_TYPE,
    revision: 0,
    message: 'Types navigation is disabled.'
});

function composeBuiltinSnapshot(
    fileSnapshot: TpsNavigatorTypesSnapshot,
    lineSnapshot: TpsNavigatorTypesSnapshot,
    revision: number
): TpsNavigatorTypesSnapshot {
    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors = TPS_NAVIGATOR_STRUCTURAL_TYPES.map(descriptor => {
        const sourceSnapshot = isTpsNavigatorFileTypeId(descriptor.id) ? fileSnapshot : lineSnapshot;
        const records = sourceSnapshot.recordsByType.get(descriptor.id) ?? Object.freeze([]);
        recordsByType.set(descriptor.id, records);
        return Object.freeze({ ...descriptor, count: records.length });
    });
    const availability = fileSnapshot.availability === 'ready' ? 'ready' : fileSnapshot.availability;
    return Object.freeze({
        availability,
        descriptors: Object.freeze(descriptors),
        recordsByType,
        revision,
        ...(availability === 'ready' ? {} : { message: fileSnapshot.message ?? 'Vault file Types are unavailable.' }),
        builtinAvailability: availability,
        ...(availability === 'ready' ? {} : { builtinMessage: fileSnapshot.message ?? 'Vault file Types are unavailable.' }),
        lineAvailability: lineSnapshot.availability,
        ...(lineSnapshot.message ? { lineMessage: lineSnapshot.message } : {})
    });
}

type SnapshotListener = () => void;

function getUpdatedPaths(payload: unknown): string[] {
    const rawPaths = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as { paths?: unknown }).paths)
          ? (payload as { paths: unknown[] }).paths
          : [];
    return [...new Set(rawPaths.map(path => normalizePath(String(path ?? '').trim())).filter(Boolean))];
}

function getVaultPath(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const file = value as { path?: unknown; extension?: unknown };
    if (typeof file.path !== 'string' || !file.path.trim()) {
        return null;
    }
    return normalizePath(file.path);
}

function getMarkdownPath(value: unknown): string | null {
    const path = getVaultPath(value);
    if (!path) {
        return null;
    }
    const file = value as { extension?: unknown };
    const extension = typeof file.extension === 'string' ? file.extension.toLocaleLowerCase() : '';
    return extension === 'md' || path.toLocaleLowerCase().endsWith('.md') ? path : null;
}

function getIndexedFileTypeId(snapshot: TpsNavigatorTypesSnapshot, sourcePath: string): TpsNavigatorFileTypeId | null {
    for (const descriptor of TPS_NAVIGATOR_FILE_TYPES) {
        const records = snapshot.recordsByType.get(descriptor.id) ?? [];
        if (records.some(record => record.sourcePath === sourcePath)) {
            return descriptor.id as TpsNavigatorFileTypeId;
        }
    }
    return null;
}

export class GcmEntityTypesStore {
    private readonly adapter: GcmEntityTypeIndexAdapter;
    private fileSnapshot: TpsNavigatorTypesSnapshot = LOADING_FILE_SNAPSHOT;
    private lineSnapshot: TpsNavigatorTypesSnapshot = LOADING_LINE_SNAPSHOT;
    private snapshot: TpsNavigatorTypesSnapshot;
    private readonly listeners = new Set<SnapshotListener>();
    private stopRevision: (() => void) | null = null;
    private stopWorkspaceEvents: (() => void) | null = null;
    private stopVaultEvents: (() => void) | null = null;
    private stopMetadataEvents: (() => void) | null = null;
    private loadGeneration = 0;
    private publishedRevision = 0;
    private reloadPending = false;
    private refreshFilesPending = false;
    private refreshLinesPending = false;
    private reloadInFlight: { generation: number; task: Promise<void> } | null = null;

    constructor(private readonly app: App) {
        this.adapter = new GcmEntityTypeIndexAdapter(app);
        this.snapshot = composeBuiltinSnapshot(this.fileSnapshot, this.lineSnapshot, this.publishedRevision);
    }

    readonly subscribe = (listener: SnapshotListener): (() => void) => {
        this.listeners.add(listener);
        if (this.listeners.size === 1) {
            this.start();
        }
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.stop();
            }
        };
    };

    readonly getSnapshot = (): TpsNavigatorTypesSnapshot => this.snapshot;

    activate(record: TpsNavigatorTypeRecord): Promise<GcmEntityActivationResult> {
        return this.adapter.activate(record);
    }

    async setTaskCheckbox(record: TpsNavigatorTypeRecord, checked: boolean): Promise<GcmEntityTaskMutationResult> {
        const result = await this.adapter.setTaskCheckbox(record, checked);
        // Reconcile optimistic UI after both success and guarded failure. A
        // foreign API can report an unexpected effective state after writing.
        this.adapter.invalidateTaskPaths([record.sourcePath]);
        this.requestReload();
        return result;
    }

    addTaskContextMenuItems(menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord): boolean {
        return this.adapter.addTaskContextMenuItems(menu, record);
    }

    private start(): void {
        this.stopRevision = this.adapter.subscribe(() => {
            this.requestReload();
        });
        const workspace = this.app.workspace;
        let starting = true;
        if (workspace && typeof workspace.on === 'function' && typeof workspace.trigger === 'function') {
            const eventSource = workspace as unknown as {
                on(name: string, callback: (payload: unknown) => void): EventRef;
                offref(ref: EventRef): void;
                trigger(name: string, payload: unknown): void;
            };
            const eventRef = eventSource.on(TPS_GCM_API_CHANGED_EVENT, payload => {
                if (!this.adapter.acceptApiPayload(payload)) {
                    return;
                }
                if (!starting) {
                    this.requestReload({ supersede: true });
                }
            });
            const filesUpdatedRef = eventSource.on(TPS_FILES_UPDATED_EVENT, payload => {
                this.handleTaskPathUpdates(getUpdatedPaths(payload), { invalidateAllWhenEmpty: true });
            });
            this.stopWorkspaceEvents = () => {
                eventSource.offref(eventRef);
                eventSource.offref(filesUpdatedRef);
            };
            eventSource.trigger(TPS_GCM_API_REQUEST_EVENT, {
                sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                requester: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                timestamp: Date.now()
            });
            starting = false;
        }
        const vault = this.app.vault as unknown as {
            on(name: string, callback: (...args: unknown[]) => void): EventRef;
            offref(ref: EventRef): void;
        };
        if (vault && typeof vault.on === 'function' && typeof vault.offref === 'function') {
            const refs: EventRef[] = [];
            const subscribe = (name: string, callback: (...args: unknown[]) => void) => {
                refs.push(vault.on(name, callback));
            };
            subscribe('modify', file => {
                const path = getMarkdownPath(file);
                if (path) {
                    this.handleTaskPathUpdates([path]);
                }
            });
            subscribe('create', file => {
                const markdownPath = getMarkdownPath(file);
                if (markdownPath) {
                    this.adapter.invalidateTaskPaths([markdownPath]);
                }
                this.requestReload({ refreshFiles: true, refreshLines: markdownPath !== null });
            });
            subscribe('delete', file => {
                const markdownPath = getMarkdownPath(file);
                if (markdownPath) {
                    this.adapter.invalidateTaskPaths([markdownPath]);
                }
                this.requestReload({ refreshFiles: true, refreshLines: markdownPath !== null });
            });
            subscribe('rename', (file, oldPath) => {
                const nextPath = getMarkdownPath(file);
                const previousPath = typeof oldPath === 'string' ? normalizePath(oldPath.trim()) : '';
                this.adapter.invalidateTaskPaths([previousPath, nextPath ?? ''].filter(Boolean));
                this.requestReload({
                    refreshFiles: true,
                    refreshLines: nextPath !== null || previousPath.toLocaleLowerCase().endsWith('.md')
                });
            });
            this.stopVaultEvents = () => refs.forEach(ref => vault.offref(ref));
        }
        const metadataCache = this.app.metadataCache as unknown as {
            on?(name: string, callback: (...args: unknown[]) => void): EventRef;
            offref?(ref: EventRef): void;
        };
        if (typeof metadataCache.on === 'function' && typeof metadataCache.offref === 'function') {
            const metadataRef = metadataCache.on('changed', file => {
                const path = getMarkdownPath(file);
                if (!path || !(file instanceof TFile)) {
                    return;
                }
                try {
                    if (getIndexedFileTypeId(this.fileSnapshot, path) !== getTpsNavigatorFileTypeId(this.app, file)) {
                        this.requestReload({ refreshFiles: true, refreshLines: false });
                    }
                } catch (error) {
                    console.warn('[TPS Notebook Navigator] Vault file Type classification failed', { path, error });
                }
            });
            this.stopMetadataEvents = () => metadataCache.offref?.(metadataRef);
        }
        starting = false;
        this.requestReload({ supersede: true, refreshFiles: true });
    }

    private stop(): void {
        this.loadGeneration += 1;
        this.reloadPending = false;
        this.refreshFilesPending = false;
        this.refreshLinesPending = false;
        this.reloadInFlight = null;
        this.stopRevision?.();
        this.stopWorkspaceEvents?.();
        this.stopVaultEvents?.();
        this.stopMetadataEvents?.();
        this.stopRevision = null;
        this.stopWorkspaceEvents = null;
        this.stopVaultEvents = null;
        this.stopMetadataEvents = null;
        this.adapter.dispose();
        this.lineSnapshot = LOADING_LINE_SNAPSHOT;
        this.snapshot = composeBuiltinSnapshot(this.fileSnapshot, this.lineSnapshot, ++this.publishedRevision);
    }

    private requestReload(options: { supersede?: boolean; refreshFiles?: boolean; refreshLines?: boolean } = {}): void {
        this.reloadPending = true;
        this.refreshFilesPending ||= options.refreshFiles === true;
        this.refreshLinesPending ||= options.refreshLines !== false;
        if (this.reloadInFlight && !options.supersede) {
            return;
        }
        this.startPendingReload();
    }

    private startPendingReload(): void {
        const generation = ++this.loadGeneration;
        this.reloadPending = false;
        const refreshFiles = this.refreshFilesPending;
        const refreshLines = this.refreshLinesPending;
        this.refreshFilesPending = false;
        this.refreshLinesPending = false;
        const task = this.loadAndPublish(generation, refreshFiles, refreshLines);
        const activeLoad = { generation, task };
        this.reloadInFlight = activeLoad;
        const finish = () => {
            if (this.reloadInFlight !== activeLoad) {
                return;
            }
            this.reloadInFlight = null;
            if (this.reloadPending && this.listeners.size > 0) {
                this.startPendingReload();
            }
        };
        void task.then(finish, (error: unknown) => {
            console.warn('[TPS Notebook Navigator] Types refresh failed unexpectedly', { error });
            finish();
        });
    }

    private async loadAndPublish(generation: number, refreshFiles: boolean, refreshLines: boolean): Promise<void> {
        const fileSnapshot = refreshFiles ? this.buildFileSnapshotSafely() : this.fileSnapshot;
        if (generation === this.loadGeneration && this.listeners.size > 0) {
            this.fileSnapshot = fileSnapshot;
            this.publish(composeBuiltinSnapshot(fileSnapshot, this.lineSnapshot, ++this.publishedRevision));
        }

        if (!refreshLines) {
            return;
        }

        let lineSnapshot: TpsNavigatorTypesSnapshot;
        try {
            lineSnapshot = await this.adapter.loadSnapshot();
        } catch (error) {
            console.warn('[TPS Notebook Navigator] Exact-line Types refresh failed', { error });
            lineSnapshot = {
                availability: 'error',
                descriptors: Object.freeze([]),
                recordsByType: EMPTY_RECORDS_BY_TYPE,
                revision: 0,
                message: 'The entity index could not be loaded.'
            };
        }
        if (generation !== this.loadGeneration || this.listeners.size === 0) {
            return;
        }
        this.fileSnapshot = fileSnapshot;
        this.lineSnapshot = lineSnapshot;
        this.publish(composeBuiltinSnapshot(fileSnapshot, lineSnapshot, ++this.publishedRevision));
    }

    private buildFileSnapshotSafely(): TpsNavigatorTypesSnapshot {
        try {
            return buildVaultFileTypesSnapshot(this.app);
        } catch (error) {
            console.warn('[TPS Notebook Navigator] Vault file Types refresh failed', { error });
            if (this.fileSnapshot.availability !== 'loading') {
                return this.fileSnapshot;
            }
            return Object.freeze({
                ...buildVaultFileTypesSnapshotFromFiles(this.app, []),
                availability: 'error',
                message: 'Vault file Types could not be loaded.'
            });
        }
    }

    private publish(snapshot: TpsNavigatorTypesSnapshot): void {
        this.snapshot = snapshot;
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch {
                // One React consumer must not break the shared refresh loop.
            }
        }
    }

    private handleTaskPathUpdates(paths: readonly string[], options: { invalidateAllWhenEmpty?: boolean } = {}): void {
        if (paths.length === 0) {
            if (options.invalidateAllWhenEmpty) {
                this.adapter.invalidateTaskPaths();
                this.requestReload();
            }
            return;
        }
        const taskSourcePaths = new Set<string>();
        for (const records of this.snapshot.recordsByType.values()) {
            records.forEach(record => {
                if (record.lineKind === 'task') {
                    taskSourcePaths.add(normalizePath(record.sourcePath));
                }
            });
        }
        const relevantPaths = [...new Set(paths.map(path => normalizePath(path)).filter(path => taskSourcePaths.has(path)))];
        if (relevantPaths.length === 0) {
            return;
        }
        this.adapter.invalidateTaskPaths(relevantPaths);
        this.requestReload();
    }
}

const STORES = new WeakMap<App, GcmEntityTypesStore>();

/** Shared provider-neutral catalog store used by React and the public Types API. */
export function getNavigatorTypesStore(app: App): GcmEntityTypesStore {
    const existing = STORES.get(app);
    if (existing) {
        return existing;
    }
    const created = new GcmEntityTypesStore(app);
    STORES.set(app, created);
    return created;
}

export interface UseGcmEntityTypesResult {
    snapshot: TpsNavigatorTypesSnapshot;
    activate: (record: TpsNavigatorTypeRecord) => Promise<GcmEntityActivationResult>;
    setTaskCheckbox: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<GcmEntityTaskMutationResult>;
    addTaskContextMenuItems: (menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord) => boolean;
}

export function useGcmEntityTypes(app: App, enabled: boolean): UseGcmEntityTypesResult {
    const store = useMemo(() => getNavigatorTypesStore(app), [app]);
    const subscribe = useCallback(
        (listener: SnapshotListener) => (enabled ? store.subscribe(listener) : () => undefined),
        [enabled, store]
    );
    const getSnapshot = useCallback(() => (enabled ? store.getSnapshot() : DISABLED_SNAPSHOT), [enabled, store]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const activate = useCallback((record: TpsNavigatorTypeRecord) => store.activate(record), [store]);
    const setTaskCheckbox = useCallback(
        (record: TpsNavigatorTypeRecord, checked: boolean) => store.setTaskCheckbox(record, checked),
        [store]
    );
    const addTaskContextMenuItems = useCallback(
        (menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord) => store.addTaskContextMenuItems(menu, record),
        [store]
    );
    return useMemo(
        () => ({ snapshot, activate, setTaskCheckbox, addTaskContextMenuItems }),
        [activate, addTaskContextMenuItems, setTaskCheckbox, snapshot]
    );
}
