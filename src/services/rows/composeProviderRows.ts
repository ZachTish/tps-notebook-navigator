/*
 * TPS Notebook Navigator - isolated composition of optional provider rows.
 */

import type { NavigatorRowProviderRegistry } from './NavigatorRowProviderRegistry';
import { resolveNavigatorRowProvidersForScope } from './providerScope';
import {
    NAVIGATOR_ROW_PROVIDER_MAX_ROWS,
    type NavigatorProvidedRow,
    type NavigatorProvidedRowCandidate,
    type NavigatorRowProvider,
    type NavigatorRowProviderContext,
    type NavigatorRowProviderFailure,
    type NavigatorRowProviderOptions,
    type NavigatorRowProviderSelection
} from './types';

export { NAVIGATOR_ROW_PROVIDER_MAX_ROWS } from './types';

export const NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS = 5_000;

export interface NavigatorProviderRowsSnapshot {
    /** Configured, registered providers in deterministic presentation order. */
    readonly providerIds: readonly string[];
    /** Providers whose current query has settled, including empty and failed providers. */
    readonly settledProviderIds: readonly string[];
    /** Current-revision rows from settled providers, globally capped in provider order. */
    readonly rows: readonly NavigatorProvidedRow[];
}

interface ComposeProviderRowsOptions {
    registry: NavigatorRowProviderRegistry;
    context: NavigatorRowProviderContext;
    selection: NavigatorRowProviderSelection;
    onFailure?: (failure: NavigatorRowProviderFailure) => void;
    /** Receives deterministic partial results whenever another provider settles. */
    onSnapshot?: (snapshot: NavigatorProviderRowsSnapshot) => void;
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isUsableCheckboxIndicator(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (!value || typeof value !== 'object') {
        return false;
    }
    const indicator = value as Record<string, unknown>;
    return (
        indicator.type === 'checkbox' &&
        typeof indicator.checked === 'boolean' &&
        isOptionalString(indicator.marker) &&
        (indicator.onChange === undefined || typeof indicator.onChange === 'function')
    );
}

function isUsableCandidate(candidate: unknown): candidate is NavigatorProvidedRowCandidate {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    const row = candidate as Record<string, unknown>;
    return (
        typeof row.id === 'string' &&
        row.id.trim().length > 0 &&
        typeof row.kind === 'string' &&
        row.kind.includes('/') &&
        typeof row.label === 'string' &&
        typeof row.sourcePath === 'string' &&
        row.sourcePath.trim().length > 0 &&
        isOptionalString(row.secondaryLabel) &&
        isOptionalString(row.tooltip) &&
        (row.sourceLineNumber === undefined ||
            (typeof row.sourceLineNumber === 'number' && Number.isSafeInteger(row.sourceLineNumber) && row.sourceLineNumber >= 0)) &&
        isUsableCheckboxIndicator(row.indicator) &&
        (row.activate === undefined || typeof row.activate === 'function') &&
        (row.contextMenu === undefined || typeof row.contextMenu === 'function')
    );
}

async function queryProviderWithTimeout(
    provider: NavigatorRowProvider,
    context: NavigatorRowProviderContext,
    options: NavigatorRowProviderOptions
): Promise<unknown> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Row provider query timed out.')), NAVIGATOR_ROW_PROVIDER_QUERY_TIMEOUT_MS);
    });

    try {
        return await Promise.race([Promise.resolve().then(() => provider.getRows(context, options ?? {})), timeout]);
    } finally {
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    }
}

function normalizeProviderRows(
    providerId: string,
    candidates: readonly unknown[],
    visibleFilePaths: ReadonlySet<string>
): NavigatorProvidedRow[] {
    const rows: NavigatorProvidedRow[] = [];
    const ids = new Set<string>();

    for (const candidate of candidates) {
        if (!isUsableCandidate(candidate) || !visibleFilePaths.has(candidate.sourcePath) || ids.has(candidate.id)) {
            continue;
        }
        ids.add(candidate.id);
        rows.push({ ...candidate, providerId });
    }

    return rows;
}

function composeSettledProviderRows(providerRows: readonly (readonly NavigatorProvidedRow[] | null)[]): NavigatorProvidedRow[] {
    const rows: NavigatorProvidedRow[] = [];

    for (const settledRows of providerRows) {
        if (!settledRows || settledRows.length === 0) {
            continue;
        }
        const remaining = NAVIGATOR_ROW_PROVIDER_MAX_ROWS - rows.length;
        if (remaining <= 0) {
            break;
        }
        rows.push(...settledRows.slice(0, remaining));
    }

    return rows;
}

export async function composeProviderRows({
    registry,
    context,
    selection,
    onFailure,
    onSnapshot
}: ComposeProviderRowsOptions): Promise<NavigatorProvidedRow[]> {
    const providers = resolveNavigatorRowProvidersForScope(registry, selection.enabledProviderIds, context.scope);
    if (providers.length === 0 || context.scope.visibleFilePaths.length === 0) {
        return [];
    }

    const visibleFilePaths = new Set(context.scope.visibleFilePaths);
    const settledRows: (NavigatorProvidedRow[] | null)[] = providers.map(() => null);
    const providerIds = providers.map(provider => provider.id);
    let latestRows: NavigatorProvidedRow[] = [];
    const publishSnapshot = () => {
        const nextRows = composeSettledProviderRows(settledRows);
        latestRows = nextRows;
        onSnapshot?.({
            providerIds,
            settledProviderIds: providerIds.filter((_providerId, index) => settledRows[index] !== null),
            rows: nextRows
        });
    };

    await Promise.all(
        providers.map(async (provider, providerIndex) => {
            let result: unknown;
            try {
                result = await queryProviderWithTimeout(provider, context, selection.optionsByProviderId?.[provider.id] ?? {});
            } catch (error) {
                settledRows[providerIndex] = [];
                onFailure?.({ providerId: provider.id, error });
                publishSnapshot();
                return;
            }

            if (!Array.isArray(result)) {
                settledRows[providerIndex] = [];
                onFailure?.({ providerId: provider.id, error: new Error('Row provider returned a non-array result.') });
                publishSnapshot();
                return;
            }

            if (result.length > NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
                settledRows[providerIndex] = [];
                onFailure?.({ providerId: provider.id, error: new Error('Row provider exceeded the row limit.') });
                publishSnapshot();
                return;
            }

            settledRows[providerIndex] = normalizeProviderRows(provider.id, result, visibleFilePaths);
            publishSnapshot();
        })
    );

    return latestRows;
}
