import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';
import {
    composeProviderRows,
    NAVIGATOR_ROW_PROVIDER_MAX_ROWS,
    NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS
} from '../../src/services/rows/composeProviderRows';
import { mergeNavigatorRowProviderSelections } from '../../src/services/rows/providerSelections';
import type {
    NavigatorProvidedRow,
    NavigatorRowDefinition,
    NavigatorRowProvider,
    NavigatorRowProviderContext
} from '../../src/services/rows/types';

const context = {
    app: {} as App,
    scope: {
        visibleFilePaths: ['Notes/one.md'],
        selectionType: null,
        selectedFolderPath: null,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null
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

    it('passes an exact Type scope only to opted-in providers and still drops orphan rows', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const legacyGetRows = vi.fn(async () => [{ id: 'duplicate', kind: 'tps/task', label: 'Legacy task', sourcePath: 'Notes/one.md' }]);
        const typeGetRows = vi.fn(async () => [
            { id: 'related', kind: 'example/related', label: 'Related', sourcePath: 'Notes/one.md' },
            { id: 'orphan', kind: 'example/related', label: 'Orphan', sourcePath: 'Notes/outside.md' }
        ]);
        registry.register({ id: 'tps/legacy-tasks', getRows: legacyGetRows });
        registry.register({ id: 'example/type-rows', supportsTypeScope: true, getRows: typeGetRows });
        const typeContext = {
            ...context,
            scope: {
                visibleFilePaths: ['Notes/one.md'],
                selectionType: 'type',
                selectedFolderPath: null,
                selectedTag: null,
                selectedProperty: null,
                selectedType: 'structural:task'
            }
        } satisfies NavigatorRowProviderContext;

        const rows = await composeProviderRows({
            registry,
            context: typeContext,
            selection: {
                enabledProviderIds: ['tps/legacy-tasks', 'example/type-rows'],
                optionsByProviderId: { 'example/type-rows': { mode: 'related' } }
            }
        });

        expect(legacyGetRows).not.toHaveBeenCalled();
        expect(typeGetRows).toHaveBeenCalledOnce();
        expect(typeGetRows).toHaveBeenCalledWith(typeContext, { mode: 'related' });
        expect(rows).toMatchObject([{ providerId: 'example/type-rows', id: 'related', sourcePath: 'Notes/one.md' }]);
    });

    it('preserves callable context-menu builders and rejects malformed ones', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const contextMenu = vi.fn();
        registry.register(
            provider('tps/actions', [
                { id: 'valid', kind: 'tps/example', label: 'Valid', sourcePath: 'Notes/one.md', contextMenu },
                {
                    id: 'invalid',
                    kind: 'tps/example',
                    label: 'Invalid',
                    sourcePath: 'Notes/one.md',
                    contextMenu: 'not callable'
                } as never
            ])
        );

        const rows = await composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/actions'] }
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.contextMenu).toBe(contextMenu);
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

    it('publishes healthy provider rows before a hanging provider reaches its timeout', async () => {
        vi.useFakeTimers();
        const registry = new NavigatorRowProviderRegistry();
        registry.register({
            id: 'tps/hanging',
            getRows: () => new Promise(() => undefined)
        });
        registry.register(provider('tps/healthy', [{ id: 'ok', kind: 'tps/example', label: 'OK', sourcePath: 'Notes/one.md' }]));
        const failures = vi.fn();
        const snapshots: string[][] = [];
        const settled = vi.fn();

        const resultPromise = composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/hanging', 'tps/healthy'] },
            onFailure: failures,
            onSnapshot: snapshot => snapshots.push(snapshot.rows.map(row => `${row.providerId}:${row.id}`))
        });
        void resultPromise.then(settled);
        await vi.advanceTimersByTimeAsync(0);

        expect(snapshots).toEqual([['tps/healthy:ok']]);
        expect(settled).not.toHaveBeenCalled();
        expect(failures).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS);

        await expect(resultPromise).resolves.toMatchObject([{ providerId: 'tps/healthy', id: 'ok' }]);
        expect(failures).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'tps/hanging' }));
    });

    it('publishes an empty first settlement so retained rows clear before another provider times out', async () => {
        vi.useFakeTimers();
        const registry = new NavigatorRowProviderRegistry();
        registry.register(provider('tps/empty', []));
        registry.register({
            id: 'tps/hanging',
            getRows: () => new Promise(() => undefined)
        });
        const snapshots: { settledProviderIds: readonly string[]; rows: readonly NavigatorProvidedRow[] }[] = [];

        const resultPromise = composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/empty', 'tps/hanging'] },
            onSnapshot: snapshot =>
                snapshots.push({
                    settledProviderIds: snapshot.settledProviderIds,
                    rows: snapshot.rows
                })
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(snapshots).toEqual([{ settledProviderIds: ['tps/empty'], rows: [] }]);

        await vi.advanceTimersByTimeAsync(NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS);
        await expect(resultPromise).resolves.toEqual([]);
        expect(snapshots).toEqual([
            { settledProviderIds: ['tps/empty'], rows: [] },
            { settledProviderIds: ['tps/empty', 'tps/hanging'], rows: [] }
        ]);
    });

    it('recomposes a late higher-priority provider ahead of an already published provider', async () => {
        vi.useFakeTimers();
        const registry = new NavigatorRowProviderRegistry();
        let resolveSlow: ((rows: readonly NavigatorRowDefinition[]) => void) | null = null;
        const slowRows = new Promise<readonly NavigatorRowDefinition[]>(resolve => {
            resolveSlow = resolve;
        });
        registry.register({ id: 'tps/slow', getRows: () => slowRows });
        registry.register(provider('tps/healthy', [{ id: 'ok', kind: 'tps/example', label: 'OK', sourcePath: 'Notes/one.md' }]));
        const snapshots: string[][] = [];

        const resultPromise = composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/slow', 'tps/healthy'] },
            onSnapshot: snapshot => snapshots.push(snapshot.rows.map(row => `${row.providerId}:${row.id}`))
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(snapshots).toEqual([['tps/healthy:ok']]);

        resolveSlow?.([{ id: 'late', kind: 'tps/example', label: 'Late', sourcePath: 'Notes/one.md' }]);
        await vi.advanceTimersByTimeAsync(0);

        await expect(resultPromise).resolves.toMatchObject([
            { providerId: 'tps/slow', id: 'late' },
            { providerId: 'tps/healthy', id: 'ok' }
        ]);
        expect(snapshots).toEqual([['tps/healthy:ok'], ['tps/slow:late', 'tps/healthy:ok']]);
    });

    it('displaces fast lower-priority rows as delayed higher-priority rows settle without exceeding the global cap', async () => {
        vi.useFakeTimers();
        const registry = new NavigatorRowProviderRegistry();
        let resolvePriority: ((rows: readonly NavigatorRowDefinition[]) => void) | null = null;
        const priorityRowsPromise = new Promise<readonly NavigatorRowDefinition[]>(resolve => {
            resolvePriority = resolve;
        });
        const createRows = (prefix: string) =>
            Array.from({ length: 800 }, (_, index) => ({
                id: `${prefix}-${index}`,
                kind: 'tps/example',
                label: `${prefix} ${index}`,
                sourcePath: 'Notes/one.md'
            }));
        registry.register({ id: 'tps/priority', getRows: () => priorityRowsPromise });
        registry.register(provider('tps/fast', createRows('fast')));
        const snapshots: NavigatorProvidedRow[][] = [];

        const resultPromise = composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/priority', 'tps/fast'] },
            onSnapshot: snapshot => snapshots.push([...snapshot.rows])
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toHaveLength(800);
        expect(snapshots[0]?.every(row => row.providerId === 'tps/fast')).toBe(true);

        resolvePriority?.(createRows('priority'));
        await vi.advanceTimersByTimeAsync(0);

        const finalRows = await resultPromise;
        expect(snapshots.every(snapshot => snapshot.length <= NAVIGATOR_ROW_PROVIDER_MAX_ROWS)).toBe(true);
        expect(finalRows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(finalRows.filter(row => row.providerId === 'tps/priority')).toHaveLength(800);
        expect(finalRows.filter(row => row.providerId === 'tps/fast')).toHaveLength(200);
        expect(finalRows[799]).toMatchObject({ providerId: 'tps/priority', id: 'priority-799' });
        expect(finalRows[800]).toMatchObject({ providerId: 'tps/fast', id: 'fast-0' });
        expect(finalRows[999]).toMatchObject({ providerId: 'tps/fast', id: 'fast-199' });
    });

    it('enforces the 1,000-row ceiling across all providers in configured order', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const createRows = (prefix: string) =>
            Array.from({ length: 600 }, (_, index) => ({
                id: `${prefix}-${index}`,
                kind: 'tps/example',
                label: `${prefix} ${index}`,
                sourcePath: 'Notes/one.md'
            }));
        registry.register(provider('tps/first', createRows('first')));
        registry.register(provider('tps/second', createRows('second')));

        const rows = await composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/first', 'tps/second'] }
        });

        expect(rows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(rows.filter(row => row.providerId === 'tps/first')).toHaveLength(600);
        expect(rows.filter(row => row.providerId === 'tps/second')).toHaveLength(400);
        expect(rows[599]).toMatchObject({ providerId: 'tps/first', id: 'first-599' });
        expect(rows[600]).toMatchObject({ providerId: 'tps/second', id: 'second-0' });
        expect(rows[999]).toMatchObject({ providerId: 'tps/second', id: 'second-399' });
    });

    it('does not spend the global budget on invalid, duplicate, or orphan rows', async () => {
        const registry = new NavigatorRowProviderRegistry();
        const validRows: NavigatorRowDefinition[] = Array.from({ length: 997 }, (_, index) => ({
            id: `first-${index}`,
            kind: 'tps/example',
            label: `First ${index}`,
            sourcePath: 'Notes/one.md'
        }));
        registry.register(
            provider('tps/first', [
                ...validRows,
                validRows[0],
                { id: 'orphan', kind: 'tps/example', label: 'Orphan', sourcePath: 'Notes/missing.md' },
                { id: 'invalid', kind: 'tps/example', label: 42, sourcePath: 'Notes/one.md' } as never
            ])
        );
        registry.register(
            provider(
                'tps/second',
                Array.from({ length: 5 }, (_, index) => ({
                    id: `second-${index}`,
                    kind: 'tps/example',
                    label: `Second ${index}`,
                    sourcePath: 'Notes/one.md'
                }))
            )
        );

        const rows = await composeProviderRows({
            registry,
            context,
            selection: { enabledProviderIds: ['tps/first', 'tps/second'] }
        });

        expect(rows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(rows.filter(row => row.providerId === 'tps/first')).toHaveLength(997);
        expect(rows.filter(row => row.providerId === 'tps/second')).toHaveLength(3);
        expect(rows.some(row => row.id === 'orphan' || row.id === 'invalid')).toBe(false);
        expect(rows[rows.length - 1]).toMatchObject({ providerId: 'tps/second', id: 'second-2' });
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
