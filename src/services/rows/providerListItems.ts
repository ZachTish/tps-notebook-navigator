/*
 * TPS Notebook Navigator - converts transient provider rows into list items.
 */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, type NavigatorProvidedRow } from './types';

/**
 * Builds a complete virtualized Types list from rows that are not attached to file rows.
 *
 * Built-in exact-line rows come from the host's GCM-backed index and are intentionally not subject
 * to the external-provider safety ceiling. Externally owned and augmenting rows continue
 * to share that ceiling.
 */
export function buildStandaloneProviderListItems(
    builtInTypeRows: readonly NavigatorProvidedRow[],
    externalProviderRows: readonly NavigatorProvidedRow[]
): ListPaneItem[] {
    const seenKeys = new Set<string>();
    const rows: ListPaneItem[] = [];

    const appendRow = (row: NavigatorProvidedRow): boolean => {
        const key = `provider:${row.providerId}:${row.id}`;
        if (seenKeys.has(key)) {
            return false;
        }
        seenKeys.add(key);
        rows.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key });
        return true;
    };

    builtInTypeRows.forEach(appendRow);

    let externalRowsAdded = 0;
    for (const row of externalProviderRows) {
        if (externalRowsAdded >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            break;
        }
        if (appendRow(row)) {
            externalRowsAdded += 1;
        }
    }

    return [
        {
            type: ListPaneItemType.TOP_SPACER,
            data: '',
            key: 'top-spacer'
        },
        ...rows,
        {
            type: ListPaneItemType.BOTTOM_SPACER,
            data: '',
            key: 'bottom-spacer'
        }
    ];
}

export function mergeProviderRowsIntoList(listItems: ListPaneItem[], providerRows: readonly NavigatorProvidedRow[]): ListPaneItem[] {
    if (providerRows.length === 0) {
        return listItems;
    }

    const rowsBySourcePath = new Map<string, NavigatorProvidedRow[]>();
    for (const row of providerRows) {
        const rows = rowsBySourcePath.get(row.sourcePath) ?? [];
        rows.push(row);
        rowsBySourcePath.set(row.sourcePath, rows);
    }
    const consumedPaths = new Set<string>();
    const merged: ListPaneItem[] = [];

    for (const item of listItems) {
        merged.push(item);
        if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile) || consumedPaths.has(item.data.path)) {
            continue;
        }

        consumedPaths.add(item.data.path);
        const rows = rowsBySourcePath.get(item.data.path) ?? [];
        for (const row of rows) {
            merged.push({
                type: ListPaneItemType.PROVIDER_ROW,
                data: row,
                key: `provider:${row.providerId}:${row.id}`
            });
        }
    }

    return merged;
}
