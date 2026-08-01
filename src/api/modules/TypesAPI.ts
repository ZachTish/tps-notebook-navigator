/*
 * TPS Notebook Navigator - public, provider-neutral Types catalog API.
 */

import {
    TPS_NAVIGATOR_TYPE_IDS,
    createTpsNavigatorKindTypeId,
    getTpsNavigatorKindValue,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import type { NavigatorTypeDescriptor, NavigatorTypesListener, NavigatorTypesSnapshot } from '../types';

export interface NavigatorTypesStore {
    getSnapshot(): TpsNavigatorTypesSnapshot;
    subscribe(listener: () => void): () => void;
}

const DISABLED_SNAPSHOT: NavigatorTypesSnapshot = Object.freeze({
    availability: 'disabled',
    descriptors: Object.freeze([]),
    revision: 0,
    message: 'Types navigation is disabled.'
});

const DISPOSED_SNAPSHOT: NavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    revision: 0,
    message: 'The Types catalog is unavailable after plugin unload.'
});

function toPublicDescriptor(descriptor: TpsNavigatorTypesSnapshot['descriptors'][number]): NavigatorTypeDescriptor {
    return Object.freeze({
        id: descriptor.id,
        label: descriptor.label,
        icon: descriptor.icon,
        category: descriptor.category
    });
}

function toPublicSnapshot(snapshot: TpsNavigatorTypesSnapshot): NavigatorTypesSnapshot {
    const descriptors = Object.freeze(snapshot.descriptors.map(toPublicDescriptor));
    const publicSnapshot: NavigatorTypesSnapshot = {
        availability: snapshot.availability,
        descriptors,
        revision: snapshot.revision
    };
    if (snapshot.message !== undefined) {
        return Object.freeze({ ...publicSnapshot, message: snapshot.message });
    }
    return Object.freeze(publicSnapshot);
}

/**
 * Read-only catalog controller for structural and relational Navigator Types.
 *
 * The controller owns at most one subscription to the underlying entity store,
 * regardless of how many external consumers subscribe or await readiness.
 */
export class TypesAPI {
    readonly notesId = TPS_NAVIGATOR_TYPE_IDS.NOTES;
    readonly checkboxesId = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
    readonly bulletsId = TPS_NAVIGATOR_TYPE_IDS.BULLETS;
    readonly headingsId = TPS_NAVIGATOR_TYPE_IDS.HEADINGS;

    private readonly listeners = new Set<NavigatorTypesListener>();
    private readonly readyWaiters = new Set<(snapshot: NavigatorTypesSnapshot) => void>();
    private unsubscribeStore: (() => void) | null = null;
    private cachedSourceSnapshot: TpsNavigatorTypesSnapshot | null = null;
    private cachedPublicSnapshot: NavigatorTypesSnapshot | null = null;
    private enabled: boolean;
    private disposed = false;

    constructor(
        private readonly store: NavigatorTypesStore,
        enabled = true
    ) {
        this.enabled = enabled;
    }

    /** Build an opaque Kind Type id from a configured Kind value. */
    buildKind(kind: string): string | null {
        return createTpsNavigatorKindTypeId(kind);
    }

    /** Parse the Kind value from an opaque Kind Type id. */
    parseKind(typeId: string): string | null {
        return typeof typeId === 'string' ? getTpsNavigatorKindValue(typeId) : null;
    }

    /** Return whether a runtime value is a syntactically valid Type id. */
    isType(typeId: unknown): boolean {
        return isTpsNavigatorTypeId(typeId);
    }

    /** Return the latest immutable provider-neutral discovery snapshot. */
    getSnapshot(): NavigatorTypesSnapshot {
        if (this.disposed) {
            return DISPOSED_SNAPSHOT;
        }
        if (!this.enabled) {
            return DISABLED_SNAPSHOT;
        }

        const sourceSnapshot = this.store.getSnapshot();
        if (sourceSnapshot === this.cachedSourceSnapshot && this.cachedPublicSnapshot) {
            return this.cachedPublicSnapshot;
        }

        this.cachedSourceSnapshot = sourceSnapshot;
        this.cachedPublicSnapshot = toPublicSnapshot(sourceSnapshot);
        return this.cachedPublicSnapshot;
    }

    /**
     * Subscribe to catalog changes. The listener receives the current snapshot
     * synchronously before this method returns.
     */
    subscribe(listener: NavigatorTypesListener): () => void {
        if (this.disposed) {
            try {
                listener(DISPOSED_SNAPSHOT);
            } catch {
                // Keep post-unload reads inert even when an external consumer fails.
            }
            return () => undefined;
        }

        this.listeners.add(listener);
        this.ensureStoreSubscription();
        try {
            listener(this.getSnapshot());
        } catch {
            // Match later delivery: one external consumer must not interrupt subscription setup.
        }

        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            this.listeners.delete(listener);
            this.stopStoreSubscriptionWhenIdle();
        };
    }

    /** Resolve on the first non-loading snapshot, including guarded failure states. */
    whenReady(): Promise<NavigatorTypesSnapshot> {
        const current = this.getSnapshot();
        if (current.availability !== 'loading') {
            return Promise.resolve(current);
        }

        return new Promise(resolve => {
            this.readyWaiters.add(resolve);
            this.ensureStoreSubscription();
            this.resolveReadyWaiters(this.getSnapshot());
        });
    }

    /** @internal Enable or disable discovery after a settings update. */
    updateEnabled(enabled: boolean): void {
        if (this.disposed || this.enabled === enabled) {
            return;
        }

        this.enabled = enabled;
        this.cachedSourceSnapshot = null;
        this.cachedPublicSnapshot = null;
        if (!enabled) {
            this.unsubscribeStore?.();
            this.unsubscribeStore = null;
        } else {
            this.ensureStoreSubscription();
        }
        this.publish(this.getSnapshot());
    }

    /** @internal Release the shared-store subscription and all public listeners. */
    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.unsubscribeStore?.();
        this.unsubscribeStore = null;
        this.cachedSourceSnapshot = null;
        this.cachedPublicSnapshot = null;
        this.publish(DISPOSED_SNAPSHOT);
        this.listeners.clear();
    }

    private ensureStoreSubscription(): void {
        if (this.disposed || !this.enabled || this.unsubscribeStore || (this.listeners.size === 0 && this.readyWaiters.size === 0)) {
            return;
        }

        this.unsubscribeStore = this.store.subscribe(() => {
            this.cachedSourceSnapshot = null;
            this.cachedPublicSnapshot = null;
            this.publish(this.getSnapshot());
        });
    }

    private publish(snapshot: NavigatorTypesSnapshot): void {
        for (const listener of [...this.listeners]) {
            try {
                listener(snapshot);
            } catch {
                // One external consumer must not interrupt catalog delivery.
            }
        }
        this.resolveReadyWaiters(snapshot);
    }

    private resolveReadyWaiters(snapshot: NavigatorTypesSnapshot): void {
        if (snapshot.availability === 'loading') {
            return;
        }

        for (const resolve of [...this.readyWaiters]) {
            resolve(snapshot);
        }
        this.readyWaiters.clear();
        this.stopStoreSubscriptionWhenIdle();
    }

    private stopStoreSubscriptionWhenIdle(): void {
        if (this.listeners.size > 0 || this.readyWaiters.size > 0) {
            return;
        }
        this.unsubscribeStore?.();
        this.unsubscribeStore = null;
    }
}
