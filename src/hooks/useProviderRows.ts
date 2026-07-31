/*
 * TPS Notebook Navigator - React lifecycle for optional navigator row providers.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API, type NotebookNavigatorAPI } from '../api/NotebookNavigatorAPI';
import type { NavigatorRowProviderRegistry } from '../services/rows/NavigatorRowProviderRegistry';
import { composeProviderRows } from '../services/rows/composeProviderRows';
import type {
    NavigatorProvidedRow,
    NavigatorRowProviderContext,
    NavigatorRowProviderSelection,
    NavigatorRowScope
} from '../services/rows/types';

interface UseProviderRowsParams {
    app: App;
    registry: NavigatorRowProviderRegistry;
    scope: NavigatorRowScope;
    selection: NavigatorRowProviderSelection;
}

const EMPTY_EXTERNAL_ROW_PROVIDER_SELECTION: NavigatorRowProviderSelection = Object.freeze({
    enabledProviderIds: Object.freeze([]),
    optionsByProviderId: Object.freeze({})
});

/** Subscribes a list pane to complete public provider activation state. */
export function useExternalRowProviderSelection(api: NotebookNavigatorAPI | null): NavigatorRowProviderSelection {
    const rows = api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].rows ?? null;
    const subscribe = useCallback((listener: () => void) => rows?.subscribe(listener) ?? (() => undefined), [rows]);
    const getSnapshot = useCallback(() => rows?.getSelection() ?? EMPTY_EXTERNAL_ROW_PROVIDER_SELECTION, [rows]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useProviderRows({ app, registry, scope, selection }: UseProviderRowsParams): NavigatorProvidedRow[] {
    const [result, setResult] = useState<{
        scope: NavigatorRowScope | null;
        selection: NavigatorRowProviderSelection | null;
        revision: number;
        rows: NavigatorProvidedRow[];
    }>({ scope: null, selection: null, revision: -1, rows: [] });
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const context: NavigatorRowProviderContext = { app, scope };
        const cleanups: { providerId: string; cleanup: () => void }[] = [];
        let active = true;

        for (const provider of registry.resolve(selection.enabledProviderIds)) {
            try {
                const cleanup = provider.subscribe?.(context, selection.optionsByProviderId?.[provider.id] ?? {}, () => {
                    if (active) {
                        setRevision(current => current + 1);
                    }
                });
                if (typeof cleanup === 'function') {
                    cleanups.push({ providerId: provider.id, cleanup });
                }
            } catch {
                console.warn('[TPS Notebook Navigator] Row provider subscription failed', {
                    providerId: provider.id
                });
            }
        }

        return () => {
            active = false;
            cleanups.forEach(({ providerId, cleanup }) => {
                try {
                    cleanup();
                } catch {
                    console.warn('[TPS Notebook Navigator] Row provider cleanup failed', { providerId });
                }
            });
        };
    }, [app, registry, scope, selection]);

    useEffect(() => {
        let cancelled = false;
        const context: NavigatorRowProviderContext = { app, scope };

        void composeProviderRows({
            registry,
            context,
            selection,
            onFailure: ({ providerId }) => {
                console.warn('[TPS Notebook Navigator] Row provider query failed', { providerId });
            }
        })
            .then(nextRows => {
                if (!cancelled) {
                    setResult({ scope, selection, revision, rows: nextRows });
                }
            })
            .catch(() => {
                console.warn('[TPS Notebook Navigator] Row provider composition failed');
                if (!cancelled) {
                    setResult({ scope, selection, revision, rows: [] });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [app, registry, revision, scope, selection]);

    if (result.scope !== scope || result.selection !== selection || result.revision !== revision) {
        return [];
    }
    return result.rows;
}
