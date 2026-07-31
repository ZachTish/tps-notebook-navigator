/*
 * TPS Notebook Navigator - deterministic registry for optional list row providers.
 */

import type { NavigatorRowProvider } from './types';

const NAMESPACED_PROVIDER_ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export class NavigatorRowProviderRegistry {
    private readonly providers = new Map<string, NavigatorRowProvider>();

    register(provider: NavigatorRowProvider): () => void {
        if (!provider || typeof provider !== 'object' || typeof provider.id !== 'string') {
            throw new Error('Navigator row provider must be an object with a string ID.');
        }
        if (!NAMESPACED_PROVIDER_ID_RE.test(provider.id)) {
            throw new Error(`Navigator row provider ID must be namespaced: ${provider.id}`);
        }
        if (typeof provider.getRows !== 'function') {
            throw new Error(`Navigator row provider must implement getRows(): ${provider.id}`);
        }
        if (this.providers.has(provider.id)) {
            throw new Error(`Navigator row provider is already registered: ${provider.id}`);
        }

        this.providers.set(provider.id, provider);
        return () => {
            if (this.providers.get(provider.id) === provider) {
                this.providers.delete(provider.id);
            }
        };
    }

    get(providerId: string): NavigatorRowProvider | null {
        return this.providers.get(providerId) ?? null;
    }

    resolve(providerIds: readonly string[]): NavigatorRowProvider[] {
        const seen = new Set<string>();
        const providers: NavigatorRowProvider[] = [];

        for (const providerId of providerIds) {
            if (seen.has(providerId)) {
                continue;
            }
            seen.add(providerId);
            const provider = this.providers.get(providerId);
            if (provider) {
                providers.push(provider);
            }
        }

        return providers;
    }
}
