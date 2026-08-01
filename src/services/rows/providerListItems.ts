/*
 * TPS Notebook Navigator - converts transient provider rows into list items.
 */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { NavigatorProvidedRow } from './types';

/** Builds a complete virtualized list from rows that are not attached to file rows. */
export function buildStandaloneProviderListItems(providerRows: readonly NavigatorProvidedRow[]): ListPaneItem[] {
    return [
        {
            type: ListPaneItemType.TOP_SPACER,
            data: '',
            key: 'top-spacer'
        },
        ...providerRows.map(row => ({
            type: ListPaneItemType.PROVIDER_ROW,
            data: row,
            key: `provider:${row.providerId}:${row.id}`
        })),
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
