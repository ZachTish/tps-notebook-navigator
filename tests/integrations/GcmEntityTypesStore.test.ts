import { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TPS_GCM_API_CHANGED_EVENT, TPS_GCM_API_REQUEST_EVENT, TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import type { GcmEntityIndexApiLike } from '../../src/integrations/gcm/GcmEntityTypeIndex';
import { GcmEntityTypesStore } from '../../src/integrations/gcm/useGcmEntityTypes';

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

        const staleQuery = deferred<readonly unknown[]>();
        queryAsync.mockImplementationOnce(() => staleQuery.promise);
        revision = 5;
        revisionListener?.(5);
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(3));

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
        expect(subscriber).toHaveBeenCalledTimes(3);

        staleQuery.resolve([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(store.getSnapshot()).toMatchObject({ availability: 'ready', revision: 6 });
        expect(subscriber).toHaveBeenCalledTimes(3);

        unsubscribe();
        expect(workspace.offref).toHaveBeenCalledOnce();
        expect(unsubscribeRevision).toHaveBeenCalledOnce();
        expect(unregisterDimension).toHaveBeenCalledOnce();
        expect(replacementUnsubscribe).toHaveBeenCalledOnce();
        expect(replacementUnregister).toHaveBeenCalledOnce();
    });
});
