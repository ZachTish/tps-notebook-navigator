/*
 * TPS Notebook Navigator - isolated composition of optional provider rows.
 */

import type { NavigatorRowProviderRegistry } from './NavigatorRowProviderRegistry';
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

interface ComposeProviderRowsOptions {
    registry: NavigatorRowProviderRegistry;
    context: NavigatorRowProviderContext;
    selection: NavigatorRowProviderSelection;
    onFailure?: (failure: NavigatorRowProviderFailure) => void;
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
        (row.activate === undefined || typeof row.activate === 'function')
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

export async function composeProviderRows({
    registry,
    context,
    selection,
    onFailure
}: ComposeProviderRowsOptions): Promise<NavigatorProvidedRow[]> {
    const providers = registry.resolve(selection.enabledProviderIds);
    if (providers.length === 0 || context.scope.visibleFilePaths.length === 0) {
        return [];
    }

    const settled = await Promise.allSettled(
        providers.map(provider => queryProviderWithTimeout(provider, context, selection.optionsByProviderId?.[provider.id] ?? {}))
    );
    const rows: NavigatorProvidedRow[] = [];
    const keys = new Set<string>();

    settled.forEach((result, providerIndex) => {
        const provider = providers[providerIndex];
        if (!provider) {
            return;
        }
        if (result.status === 'rejected') {
            onFailure?.({ providerId: provider.id, error: result.reason });
            return;
        }

        if (!Array.isArray(result.value)) {
            onFailure?.({ providerId: provider.id, error: new Error('Row provider returned a non-array result.') });
            return;
        }

        if (result.value.length > NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            onFailure?.({ providerId: provider.id, error: new Error('Row provider exceeded the row limit.') });
            return;
        }

        for (const candidate of result.value) {
            if (!isUsableCandidate(candidate)) {
                continue;
            }
            const key = `${provider.id}:${candidate.id}`;
            if (keys.has(key)) {
                continue;
            }
            keys.add(key);
            rows.push({ ...candidate, providerId: provider.id });
        }
    });

    return rows;
}
