import { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    TPS_FILES_UPDATED_EVENT,
    TPS_GCM_API_CHANGED_EVENT,
    TPS_GCM_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
} from '../../src/constants/tpsIdentity';
import type { GcmEntityIndexApiLike, GcmEntityIndexRecordLike } from '../../src/integrations/gcm/GcmEntityTypeIndex';
import type { GcmTaskApiLike, GcmTaskRecordLike } from '../../src/integrations/gcm/gcmTaskApi';
import { GcmEntityTypesStore } from '../../src/integrations/gcm/useGcmEntityTypes';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolver => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe('GcmEntityTypesStore', () => {
    it('uses the public request/change handshake and coalesces revision bursts to one follow-up load', async () => {
        const app = new App();
        const firstQuery = deferred<readonly unknown[]>();
        let revision = 1;
        let revisionListener: ((nextRevision: number) => void) | null = null;
        const unregisterDimension = vi.fn();
        const unsubscribeRevision = vi.fn();
        const queryAsync = vi
            .fn<(query?: unknown) => Promise<readonly unknown[]>>()
            .mockImplementationOnce(() => firstQuery.promise)
            .mockResolvedValue([]);
        const api: GcmEntityIndexApiLike = {
            version: 3,
            queryAsync,
            ensureReady: vi.fn(async () => {}),
            getByLocator: vi.fn(() => null),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => revision),
            onChanged: vi.fn((listener: (nextRevision: number) => void) => {
                revisionListener = listener;
                return unsubscribeRevision;
            }),
            registerDimension: vi.fn(() => unregisterDimension)
        };
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: api },
            entityIndexVersion: 3
        };

        type Listener = (payload: unknown) => void;
        const listeners = new Map<string, Set<Listener>>();
        const requestPayloads: unknown[] = [];
        const workspace = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = listeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                listeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                listeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger: vi.fn((name: string, payload: unknown) => {
                if (name === TPS_GCM_API_REQUEST_EVENT) {
                    requestPayloads.push(payload);
                    listeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    return;
                }
                listeners.get(name)?.forEach(listener => listener(payload));
            })
        };
        Object.assign(app, { workspace });

        const store = new GcmEntityTypesStore(app);
        const subscriber = vi.fn();
        const unsubscribe = store.subscribe(subscriber);

        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledOnce());
        expect(requestPayloads).toEqual([
            expect.objectContaining({
                sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                requester: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
            })
        ]);

        revision = 2;
        revisionListener?.(2);
        revision = 3;
        revisionListener?.(3);
        revision = 4;
        revisionListener?.(4);
        firstQuery.resolve([]);

        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'ready', revision: 4 }));
        expect(queryAsync).toHaveBeenCalledTimes(2);
        expect(subscriber).toHaveBeenCalledOnce();

        // Task-only GCM mutations can leave the entity-index revision unchanged.
        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: [] });
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(subscriber).toHaveBeenCalledTimes(2));
        expect(store.getSnapshot()).toMatchObject({ availability: 'ready', revision: 4 });

        const staleQuery = deferred<readonly unknown[]>();
        queryAsync.mockImplementationOnce(() => staleQuery.promise);
        revision = 5;
        revisionListener?.(5);
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(4));

        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, {
            ...changedPayload,
            available: false,
            api: null,
            entityIndexVersion: null
        });
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'unavailable' }));

        const replacementUnregister = vi.fn();
        const replacementUnsubscribe = vi.fn();
        const replacementApi: GcmEntityIndexApiLike = {
            ...api,
            queryAsync: vi.fn(async () => []),
            getRevision: vi.fn(() => 6),
            onChanged: vi.fn(() => replacementUnsubscribe),
            registerDimension: vi.fn(() => replacementUnregister)
        };
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, {
            ...changedPayload,
            available: true,
            api: { entityIndex: replacementApi },
            entityIndexVersion: 3
        });
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'ready', revision: 6 }));
        expect(subscriber).toHaveBeenCalledTimes(4);

        staleQuery.resolve([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(store.getSnapshot()).toMatchObject({ availability: 'ready', revision: 6 });
        expect(subscriber).toHaveBeenCalledTimes(4);

        unsubscribe();
        expect(workspace.offref).toHaveBeenCalledTimes(2);
        expect(unsubscribeRevision).toHaveBeenCalledOnce();
        expect(unregisterDimension).toHaveBeenCalledOnce();
        expect(replacementUnsubscribe).toHaveBeenCalledOnce();
        expect(replacementUnregister).toHaveBeenCalledOnce();
    });

    it('retries a failed task hydration path after GCM or manual vault file updates', async () => {
        const app = new App();
        const file = new TFile('Tasks/Retry.md');
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);
        const entity: GcmEntityIndexRecordLike = {
            id: 'retry-task',
            path: file.path,
            name: 'Retry task',
            displayName: 'Retry task',
            basename: file.basename,
            dimensions: { kind: ['task'] },
            sourcePath: file.path,
            entityType: 'block',
            subpath: '#^retry-task',
            blockId: 'retry-task',
            lineKind: 'task',
            lineNumber: 1,
            referenceState: 'ready',
            locatorKey: 'block:retry-task',
            referenceTarget: `[[${file.path}#^retry-task]]`
        };
        let currentTask: GcmTaskRecordLike = {
            id: `${file.path}:1`,
            path: file.path,
            lineNumber: 0,
            rawLine: '- [ ] Retry task',
            title: 'Retry task',
            checkbox: '[ ]',
            marker: ' ',
            status: 'todo',
            isComplete: false,
            tags: []
        };
        let failHydration = true;
        const list = vi.fn(async () => {
            if (failHydration) {
                failHydration = false;
                throw new Error('temporary read failure');
            }
            return [currentTask];
        });
        const tasks: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const entityApi: GcmEntityIndexApiLike = {
            version: 3,
            queryAsync: vi.fn(async () => [entity]),
            ensureReady: vi.fn(async () => undefined),
            getByLocator: vi.fn(() => entity),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => 1),
            onChanged: vi.fn(() => () => undefined),
            registerDimension: vi.fn(() => () => undefined)
        };
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: entityApi, tasks },
            entityIndexVersion: 3
        };

        type Listener = (...args: unknown[]) => void;
        const workspaceListeners = new Map<string, Set<Listener>>();
        const workspace = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = workspaceListeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                workspaceListeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                workspaceListeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger: vi.fn((name: string, payload: unknown) => {
                if (name === TPS_GCM_API_REQUEST_EVENT) {
                    workspaceListeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    return;
                }
                workspaceListeners.get(name)?.forEach(listener => listener(payload));
            })
        };
        Object.assign(app, { workspace });

        const vaultListeners = new Map<string, Set<Listener>>();
        const vaultEvents = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = vaultListeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                vaultListeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                vaultListeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger(name: string, ...args: unknown[]) {
                vaultListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.vault, vaultEvents);

        const store = new GcmEntityTypesStore(app);
        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(store.getSnapshot().availability).toBe('ready'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task).toBeUndefined();

        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: [file.path] });
        await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
        await vi.waitFor(() =>
            expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task?.isComplete).toBe(false)
        );

        currentTask = { ...currentTask, rawLine: '- [x] Retry task', checkbox: '[x]', marker: 'x', isComplete: true };
        file.stat.mtime += 1;
        vaultEvents.trigger('modify', file);
        await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3));
        await vi.waitFor(() =>
            expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task?.isComplete).toBe(true)
        );

        unsubscribe();
        expect(vaultEvents.offref).toHaveBeenCalledTimes(4);
    });
});
