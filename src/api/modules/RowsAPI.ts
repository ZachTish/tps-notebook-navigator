/*
 * TPS Notebook Navigator - public, activation-complete transient row API.
 */

import { navigatorRowProviderRegistry } from '../../services/rows/defaultRegistry';
import type { NavigatorRowProviderRegistry } from '../../services/rows/NavigatorRowProviderRegistry';
import type { NavigatorRowProvider, NavigatorRowProviderOptions, NavigatorRowProviderSelection } from '../../services/rows/types';

export interface NavigatorRowProviderRegistration {
    /** Registered provider ID. */
    readonly id: string;
    /** Replace the active options and refresh every open TPS navigator view. */
    updateOptions(options: NavigatorRowProviderOptions): void;
    /** Disable and unregister this provider. Safe to call repeatedly. */
    unregister(): void;
}

interface ActiveProviderRegistration {
    provider: NavigatorRowProvider;
    options: NavigatorRowProviderOptions;
    unregisterFromRegistry: () => void;
}

const EMPTY_SELECTION: NavigatorRowProviderSelection = Object.freeze({
    enabledProviderIds: Object.freeze([]),
    optionsByProviderId: Object.freeze({})
});

function cloneOptions(options: NavigatorRowProviderOptions): NavigatorRowProviderOptions {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Navigator row provider options must be a record.');
    }
    return Object.freeze({ ...options });
}

/**
 * Public row-provider controller. Registering is also activation: a provider
 * appears in open views immediately and stays active until its handle is
 * unregistered or TPS Notebook Navigator unloads.
 */
export class RowsAPI {
    private readonly activeProviders = new Map<string, ActiveProviderRegistration>();
    private readonly listeners = new Set<() => void>();
    private selectionSnapshot: NavigatorRowProviderSelection = EMPTY_SELECTION;
    private disposed = false;

    constructor(private readonly registry: NavigatorRowProviderRegistry = navigatorRowProviderRegistry) {}

    registerProvider(provider: NavigatorRowProvider, options?: NavigatorRowProviderOptions): NavigatorRowProviderRegistration {
        if (this.disposed) {
            throw new Error('TPS Notebook Navigator row providers are unavailable after plugin unload.');
        }

        const initialOptions = cloneOptions(options === undefined ? {} : options);
        const unregisterFromRegistry = this.registry.register(provider);
        const registration: ActiveProviderRegistration = {
            provider,
            options: initialOptions,
            unregisterFromRegistry
        };
        this.activeProviders.set(provider.id, registration);
        this.refreshSelection();

        let active = true;
        return Object.freeze({
            id: provider.id,
            updateOptions: (nextOptions: NavigatorRowProviderOptions) => {
                if (!active || this.disposed || this.activeProviders.get(provider.id) !== registration) {
                    return;
                }
                registration.options = cloneOptions(nextOptions);
                this.refreshSelection();
            },
            unregister: () => {
                if (!active) {
                    return;
                }
                active = false;
                registration.unregisterFromRegistry();
                if (this.activeProviders.get(provider.id) === registration) {
                    this.activeProviders.delete(provider.id);
                    this.refreshSelection();
                }
            }
        });
    }

    /** @internal Stable snapshot consumed by React through useSyncExternalStore. */
    getSelection(): NavigatorRowProviderSelection {
        return this.selectionSnapshot;
    }

    /** @internal Subscribe to activation/options changes. */
    subscribe(listener: () => void): () => void {
        if (this.disposed) {
            return () => undefined;
        }
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** @internal Unregister all external providers during plugin unload. */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.activeProviders.forEach(registration => registration.unregisterFromRegistry());
        this.activeProviders.clear();
        this.selectionSnapshot = EMPTY_SELECTION;
        this.notifyListeners();
        this.listeners.clear();
    }

    private refreshSelection(): void {
        const enabledProviderIds: string[] = [];
        const optionsByProviderId: Record<string, NavigatorRowProviderOptions> = {};
        this.activeProviders.forEach(({ provider, options }) => {
            enabledProviderIds.push(provider.id);
            optionsByProviderId[provider.id] = options;
        });
        this.selectionSnapshot = Object.freeze({
            enabledProviderIds: Object.freeze(enabledProviderIds),
            optionsByProviderId: Object.freeze(optionsByProviderId)
        });
        this.notifyListeners();
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => {
            try {
                listener();
            } catch (error) {
                console.warn('[TPS Notebook Navigator] Row provider activation listener failed', { error });
            }
        });
    }
}
