/*
 * TPS Notebook Navigator - transient GCM presentation overlay.
 *
 * GCM may generate frontmatter-shaped values for display and ordering without
 * writing them to a note. This adapter keeps that projection outside every
 * Navigator persistence/indexing path and exposes only validated synchronous
 * reads to row, sort, and grouping consumers.
 */

import type { App, TFile } from 'obsidian';
import { TPS_GCM_API_CHANGED_EVENT, TPS_GCM_API_REQUEST_EVENT, TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID } from '../../constants/tpsIdentity';
import { getMatchingRecordValue } from '../../utils/recordUtils';
import {
    resolveGcmNotebookNavigatorPresentationApi,
    type GcmNotebookNavigatorPresentationApiLike,
    type GcmNotebookNavigatorPresentationProjectionLike
} from './gcmTaskApi';

interface GcmWorkspaceEventSource {
    on(name: string, callback: (payload: unknown) => void): unknown;
    offref(ref: unknown): void;
    trigger?(name: string, payload: unknown): void;
}

type PresentationListener = () => void;

function getProjectionPath(file: TFile | string): string {
    return typeof file === 'string' ? file : file.path;
}

function sanitizeProjection(value: unknown, expectedPath: string): GcmNotebookNavigatorPresentationProjectionLike | null | undefined {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as { filePath?: unknown; values?: unknown };
    if (
        candidate.filePath !== expectedPath ||
        !candidate.values ||
        typeof candidate.values !== 'object' ||
        Array.isArray(candidate.values)
    ) {
        return null;
    }

    const values = Object.create(null) as Record<string, string>;
    for (const key of Object.keys(candidate.values)) {
        const fieldValue = (candidate.values as Record<string, unknown>)[key];
        if (typeof fieldValue !== 'string') {
            return null;
        }
        values[key] = fieldValue;
    }

    return Object.freeze({ filePath: expectedPath, values: Object.freeze(values) });
}

function readRevision(api: GcmNotebookNavigatorPresentationApiLike): number | null {
    try {
        const revision = api.getRevision();
        return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
    } catch {
        return null;
    }
}

class GcmNotebookNavigatorPresentationStore {
    private api: GcmNotebookNavigatorPresentationApiLike | null = null;
    private apiRevision: number | null = null;
    private stopApiChanges: (() => void) | null = null;
    private workspaceRef: unknown = null;
    private readonly listeners = new Set<PresentationListener>();
    private readonly queuedFiles = new Map<string, TFile | string>();
    private ensureFlushQueued = false;
    private generation = 0;

    constructor(private readonly app: App) {}

    get(file: TFile | string): GcmNotebookNavigatorPresentationProjectionLike | null | undefined {
        this.refreshApi(false);
        const api = this.api;
        if (!api) {
            return null;
        }

        const expectedPath = getProjectionPath(file);
        let rawProjection: unknown;
        try {
            rawProjection = api.get(file);
        } catch {
            return null;
        }

        let projection: GcmNotebookNavigatorPresentationProjectionLike | null | undefined;
        try {
            projection = sanitizeProjection(rawProjection, expectedPath);
        } catch {
            return null;
        }
        if (projection === undefined) {
            this.queueEnsure(file, api);
        }
        return projection;
    }

    subscribe(listener: PresentationListener): () => void {
        this.listeners.add(listener);
        if (this.listeners.size === 1) {
            this.start();
        }
        try {
            listener();
        } catch {
            // Initial invalidation is best-effort for optional consumers.
        }

        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.stop();
            }
        };
    }

    private start(): void {
        const eventSource = this.app.workspace as unknown as Partial<GcmWorkspaceEventSource>;
        if (typeof eventSource.on === 'function' && typeof eventSource.offref === 'function') {
            try {
                this.workspaceRef = eventSource.on(TPS_GCM_API_CHANGED_EVENT, () => {
                    this.refreshApi(true);
                });
            } catch {
                this.workspaceRef = null;
            }
        }

        this.refreshApi(false);
        this.attachApiChanges();

        try {
            eventSource.trigger?.(TPS_GCM_API_REQUEST_EVENT, {
                sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                requester: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                timestamp: Date.now()
            });
        } catch {
            // Optional discovery requests must never affect Navigator startup.
        }
    }

    private stop(): void {
        const eventSource = this.app.workspace as unknown as Partial<GcmWorkspaceEventSource>;
        if (this.workspaceRef !== null && typeof eventSource.offref === 'function') {
            try {
                eventSource.offref(this.workspaceRef);
            } catch {
                // Optional integrations must never interfere with Navigator unload.
            }
        }
        this.workspaceRef = null;
        this.detachApiChanges();
    }

    private refreshApi(notifyOnSameApi: boolean): void {
        const nextApi = resolveGcmNotebookNavigatorPresentationApi(this.app);
        if (nextApi === this.api) {
            if (nextApi) {
                const nextRevision = readRevision(nextApi);
                if (nextRevision === null) {
                    this.replaceApi(null);
                    if (notifyOnSameApi) {
                        this.publish();
                    }
                    return;
                }
                if (nextRevision !== this.apiRevision) {
                    this.apiRevision = nextRevision;
                    if (notifyOnSameApi) {
                        this.publish();
                    }
                    return;
                }
            }
            if (notifyOnSameApi) {
                this.publish();
            }
            return;
        }

        this.replaceApi(nextApi && readRevision(nextApi) !== null ? nextApi : null);
        if (notifyOnSameApi) {
            this.publish();
        }
    }

    private replaceApi(nextApi: GcmNotebookNavigatorPresentationApiLike | null): void {
        this.detachApiChanges();
        this.generation += 1;
        this.queuedFiles.clear();
        this.ensureFlushQueued = false;
        this.api = nextApi;
        this.apiRevision = nextApi ? readRevision(nextApi) : null;

        this.attachApiChanges();
    }

    private attachApiChanges(): void {
        const nextApi = this.api;
        if (!nextApi || this.listeners.size === 0 || this.stopApiChanges) {
            return;
        }

        try {
            const stop = nextApi.onChanged(() => {
                if (this.api !== nextApi) {
                    return;
                }
                const nextRevision = readRevision(nextApi);
                if (nextRevision === null) {
                    this.replaceApi(null);
                } else {
                    this.apiRevision = nextRevision;
                }
                this.publish();
            });
            this.stopApiChanges = typeof stop === 'function' ? stop : null;
        } catch {
            this.stopApiChanges = null;
        }
    }

    private detachApiChanges(): void {
        try {
            this.stopApiChanges?.();
        } catch {
            // A provider disposer is advisory; local teardown still completes.
        }
        this.stopApiChanges = null;
    }

    private queueEnsure(file: TFile | string, api: GcmNotebookNavigatorPresentationApiLike): void {
        if (api !== this.api) {
            return;
        }
        this.queuedFiles.set(getProjectionPath(file), file);
        if (this.ensureFlushQueued) {
            return;
        }

        this.ensureFlushQueued = true;
        const generation = this.generation;
        queueMicrotask(() => {
            if (generation !== this.generation || api !== this.api) {
                return;
            }
            this.ensureFlushQueued = false;
            const files = [...this.queuedFiles.values()];
            this.queuedFiles.clear();
            if (files.length === 0) {
                return;
            }

            let task: Promise<void>;
            try {
                task = Promise.resolve(api.ensure(files));
            } catch {
                return;
            }
            void task.then(
                () => {
                    if (generation === this.generation && api === this.api) {
                        const nextRevision = readRevision(api);
                        if (nextRevision !== null) {
                            this.apiRevision = nextRevision;
                            this.publish();
                        }
                    }
                },
                () => undefined
            );
        });
    }

    private publish(): void {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch {
                // One presentation consumer must not break other views.
            }
        }
    }
}

const STORES = new WeakMap<App, GcmNotebookNavigatorPresentationStore>();

function getStore(app: App): GcmNotebookNavigatorPresentationStore {
    const existing = STORES.get(app);
    if (existing) {
        return existing;
    }
    const created = new GcmNotebookNavigatorPresentationStore(app);
    STORES.set(app, created);
    return created;
}

export function getGcmNotebookNavigatorPresentation(
    app: App,
    file: TFile | string
): GcmNotebookNavigatorPresentationProjectionLike | null | undefined {
    return getStore(app).get(file);
}

export function getGcmNotebookNavigatorPresentationValue(app: App, file: TFile | string, field: string): string | undefined {
    const projection = getGcmNotebookNavigatorPresentation(app, file);
    if (!projection) {
        return undefined;
    }
    const value = getMatchingRecordValue(projection.values, field);
    return typeof value === 'string' ? value : undefined;
}

export function subscribeGcmNotebookNavigatorPresentation(app: App, listener: PresentationListener): () => void {
    return getStore(app).subscribe(listener);
}
