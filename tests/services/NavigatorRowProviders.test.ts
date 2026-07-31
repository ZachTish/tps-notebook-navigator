import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';
import {
    composeProviderRows,
    NAVIGATOR_ROW_PROVIDER_MAX_ROWS,
    NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS
} from '../../src/services/rows/composeProviderRows';
import { mergeNavigatorRowProviderSelections } from '../../src/services/rows/providerSelections';
import type { NavigatorRowProvider, NavigatorRowProviderContext } from '../../src/services/rows/types';

const context = {
    app: {} as App,
    scope: {
        visibleFilePaths: ['Notes/one.md'],
        selectionType: null,
        selectedFolderPath: null,
        selectedTag: null,
        selectedProperty: null
    }
} satisfies NavigatorRowProviderContext;

function provider(id: string, rows: Awaited<ReturnType<NavigatorRowProvider['getRows']>>): NavigatorRowProvider {
    return {
        id,
        getRows: vi.fn(async () => rows)
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('NavigatorRowProviderRegistry', () => {
    it('requires namespaced provider IDs and rejects duplicate registrations', () => {
        const registry = new NavigatorRowProviderRegistry();

        expect(() => registry.register(provider('plain', []))).toThrow(/namespaced/u);
        const first = provider('tps/one', []);
        registry.register(first);
        expect(() => registry.register(provider('tps/one', []))).toThrow(/already registered/u);
        expect(() => registry.register({ id: 'tps/missing' } as never)).toThrow(/getRows/u);
    });

    it('resolves providers in requested order and unregisters only its own instance', () => {
        const registry = new NavigatorRowProviderRegistry();
        const one = provider('tps/one', []);
        const two = provider('tps/two', []);
        const unregisterOne = registry.register(one);
        registry.register(two);

        expect(registry.resolve(['tps/two', 'missing/provider', 'tps/one', 'tps/two'])).toEqual([two, one]);
        unregisterOne();
        unregisterOne();
        expect(registry.resolve(['tps/one', 'tps/two'])).toEqual([two]);
    });
});

describe('composeProviderRows', () => {
    it('isolates provider failures, preserves provider order, and removes duplicate provider-local IDs', async () => {
        const registry = new NavigatorRowProviderRegistry();
        registry.register(
            provider('tps/one', [
                { id: 'a', kind: 'tps/example', label: 'A', sourcePath: 'Notes/one.md' },
                { id: 'a', kind: 'tps/example', label: 'Duplicate', sourcePath: 'Notes/one.md' }
            ])
        );
        registry.register({
            id: 'tps/broken',
            getRows: async () => {
                throw new Error('provider failed');
            }
        });
        registry.register(provider('tps/two', [{ id: 'b', kind: 'tps/example', label: 'B', sourcePath: 'Notes/one.md' }]));
        const failures = vi.fn();

        const rows = await composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/one', 'tps/broken', 'tps/two'] },
            onFailure: failures
        });

        expect(rows.map(row => `${row.providerId}:${row.id}`)).toEqual(['tps/one:a', 'tps/two:b']);
        expect(failures).toHaveBeenCalledTimes(1);
        expect(failures.mock.calls[0]?.[0]).toMatchObject({ providerId: 'tps/broken' });
    });

    it('does not invoke providers when there are no exact visible file paths', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const getRows = vi.fn(async () => [{ id: 'a', kind: 'tps/example', label: 'A', sourcePath: 'one.md' }]);
        registry.register({ id: 'tps/one', getRows });

        const rows = await composeProviderRows({
            registry,
            context: { ...context, scope: { ...context.scope, visibleFilePaths: [] } },
            selection: { enabledProviderIds: ['tps/one'] }
        });

        expect(rows).toEqual([]);
        expect(getRows).not.toHaveBeenCalled();
    });

    it('isolates a provider that violates the array result contract', async () => {
        const registry = new NavigatorRowProviderRegistry();
        registry.register({
            id: 'tps/invalid',
            getRows: vi.fn(async () => null) as never
        });
        const failures = vi.fn();

        await expect(
            composeProviderRows({
                registry,
                context,
                selection: { enabledProviderIds: ['tps/invalid'] },
                onFailure: failures
            })
        ).resolves.toEqual([]);
        expect(failures).toHaveBeenCalledOnce();
    });

    it('drops rows with malformed optional interaction contracts', async () => {
        const registry = new NavigatorRowProviderRegistry();
        registry.register(
            provider('tps/invalid', [
                {
                    id: 'bad-indicator',
                    kind: 'tps/example',
                    label: 'Bad indicator',
                    sourcePath: 'Notes/one.md',
                    indicator: { type: 'checkbox', checked: 'yes' }
                } as never,
                {
                    id: 'bad-action',
                    kind: 'tps/example',
                    label: 'Bad action',
                    sourcePath: 'Notes/one.md',
                    activate: 'open'
                } as never
            ])
        );

        await expect(
            composeProviderRows({
                registry,
                context,
                selection: { enabledProviderIds: ['tps/invalid'] }
            })
        ).resolves.toEqual([]);
    });

    it('times out a hanging provider without blocking a healthy provider', async () => {
        vi.useFakeTimers();
        const registry = new NavigatorRowProviderRegistry();
        registry.register({
            id: 'tps/hanging',
            getRows: () => new Promise(() => undefined)
        });
        registry.register(provider('tps/healthy', [{ id: 'ok', kind: 'tps/example', label: 'OK', sourcePath: 'Notes/one.md' }]));
        const failures = vi.fn();

        const resultPromise = composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/hanging', 'tps/healthy'] },
            onFailure: failures
        });
        await vi.advanceTimersByTimeAsync(NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS);

        await expect(resultPromise).resolves.toMatchObject([{ providerId: 'tps/healthy', id: 'ok' }]);
        expect(failures).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'tps/hanging' }));
    });

    it('drops an oversized provider result before it reaches virtualization', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const rows = Array.from({ length: NAVIGATOR_ROW_PROVIDER_MAX_ROWS + 1 }, (_, index) => ({
            id: `${index}`,
            kind: 'tps/example',
            label: `Row ${index}`,
            sourcePath: 'Notes/one.md'
        }));
        registry.register(provider('tps/oversized', rows));
        const failures = vi.fn();

        await expect(
            composeProviderRows({
                registry,
                context,
                selection: { enabledProviderIds: ['tps/oversized'] },
                onFailure: failures
            })
        ).resolves.toEqual([]);
        expect(failures).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'tps/oversized' }));
    });
});

describe('mergeNavigatorRowProviderSelections', () => {
    it('keeps built-in providers first and adds active public registrations', () => {
        expect(
            mergeNavigatorRowProviderSelections(
                {
                    enabledProviderIds: ['tps/built-in'],
                    optionsByProviderId: { 'tps/built-in': { source: 'settings' } }
                },
                {
                    enabledProviderIds: ['external/one', 'tps/built-in'],
                    optionsByProviderId: {
                        'external/one': { source: 'api' },
                        'tps/built-in': { source: 'duplicate' }
                    }
                }
            )
        ).toEqual({
            enabledProviderIds: ['tps/built-in', 'external/one'],
            optionsByProviderId: {
                'tps/built-in': { source: 'settings' },
                'external/one': { source: 'api' }
            }
        });
    });
});
