/*
 * TPS Notebook Navigator - converts transient provider rows into list items.
 */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { TpsNavigatorLineTypeId } from '../../types/navigatorTypes';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, type NavigatorProvidedRow } from './types';
import { getPropertyGroupingValues } from '../../utils/sortUtils';
import { getMatchingRecordValue } from '../../utils/recordUtils';

export interface ProviderPropertyGrouping {
    propertyKey: string;
    noValueLabel: string;
    noValuePosition: 'top' | 'bottom';
}

/**
 * Builds a complete virtualized Types list from rows that are not attached to file rows.
 *
 * Built-in source-backed structural rows are intentionally not subject to the external-provider
 * safety ceiling. Externally owned and augmenting rows continue
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

export function mergeProviderRowsIntoList(
    listItems: ListPaneItem[],
    providerRows: readonly NavigatorProvidedRow[],
    propertyGrouping?: ProviderPropertyGrouping
): ListPaneItem[] {
    if (providerRows.length === 0) {
        return listItems;
    }

    const propertyRows = propertyGrouping ? providerRows.filter(row => row.properties !== undefined) : [];
    const attachedRows = propertyRows.length === 0 ? providerRows : providerRows.filter(row => row.properties === undefined);
    const rowsBySourcePath = new Map<string, NavigatorProvidedRow[]>();
    for (const row of attachedRows) {
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

    if (!propertyGrouping || propertyRows.length === 0) return merged;

    const rowsByGroup = new Map<string, NavigatorProvidedRow[]>();
    propertyRows.forEach(row => {
        const rawValue = getMatchingRecordValue(row.properties, propertyGrouping.propertyKey);
        const values = getPropertyGroupingValues(rawValue);
        const labels = values.length > 0 ? values.map(value => value.parts.join(', ')) : [propertyGrouping.noValueLabel];
        labels.forEach(label => {
            const rows = rowsByGroup.get(label) ?? [];
            rows.push(row);
            rowsByGroup.set(label, rows);
        });
    });

    const result: ListPaneItem[] = [];
    let currentPropertyLabel: string | null = null;
    const renderedLabels = new Set<string>();
    const flush = () => {
        if (currentPropertyLabel === null) return;
        const rows = rowsByGroup.get(currentPropertyLabel) ?? [];
        rows.forEach(row => {
            result.push({
                type: ListPaneItemType.PROVIDER_ROW,
                data: row,
                key: `provider:${row.providerId}:${row.id}:${currentPropertyLabel}`
            });
        });
        if (rows.length > 0) renderedLabels.add(currentPropertyLabel);
        currentPropertyLabel = null;
    };
    merged.forEach(item => {
        if (item.type === ListPaneItemType.HEADER && item.headerKind === 'property') {
            flush();
            currentPropertyLabel = typeof item.data === 'string' ? item.data : '';
        } else if (item.type === ListPaneItemType.BOTTOM_SPACER) {
            flush();
        }
        result.push(item);
    });
    flush();

    const missingLabels = Array.from(rowsByGroup.keys()).filter(label => !renderedLabels.has(label));
    const bottomIndex = result.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
    const additions: ListPaneItem[] = missingLabels.flatMap(label => [
        {
            type: ListPaneItemType.HEADER,
            data: label,
            key: `header-provider-property:${propertyGrouping.propertyKey}:${label}`,
            headerKind: 'property' as const,
            groupFilePaths: (rowsByGroup.get(label) ?? []).map(row => row.sourcePath)
        },
        ...(rowsByGroup.get(label) ?? []).map(row => ({
            type: ListPaneItemType.PROVIDER_ROW,
            data: row,
            key: `provider:${row.providerId}:${row.id}:${label}`
        }))
    ]);
    if (additions.length === 0) return result;
    const insertionIndex = bottomIndex === -1 ? result.length : bottomIndex;
    if (propertyGrouping.noValuePosition === 'top' && missingLabels.includes(propertyGrouping.noValueLabel)) {
        const firstHeader = result.findIndex(item => item.type === ListPaneItemType.HEADER && item.headerKind === 'property');
        const noValueAdditions = additions.filter(
            item => item.data === propertyGrouping.noValueLabel || item.key.endsWith(`:${propertyGrouping.noValueLabel}`)
        );
        const otherAdditions = additions.filter(item => !noValueAdditions.includes(item));
        const topIndex = firstHeader === -1 ? insertionIndex : firstHeader;
        result.splice(topIndex, 0, ...noValueAdditions);
        result.splice(insertionIndex + noValueAdditions.length, 0, ...otherAdditions);
        return result;
    }
    result.splice(insertionIndex, 0, ...additions);
    return result;
}

/** Appends transient augmenting rows to an already-built standalone list without disturbing its headers. */
export function appendProviderRowsToStandaloneList(
    listItems: readonly ListPaneItem[],
    providerRows: readonly NavigatorProvidedRow[]
): ListPaneItem[] {
    if (providerRows.length === 0) {
        return [...listItems];
    }

    const seenKeys = new Set(listItems.map(item => item.key));
    const additions: ListPaneItem[] = [];
    for (const row of providerRows) {
        if (additions.length >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            break;
        }
        const key = `provider:${row.providerId}:${row.id}`;
        if (seenKeys.has(key)) {
            continue;
        }
        seenKeys.add(key);
        additions.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key });
    }
    if (additions.length === 0) {
        return [...listItems];
    }

    const bottomIndex = listItems.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
    if (bottomIndex === -1) {
        return [...listItems, ...additions];
    }
    return [...listItems.slice(0, bottomIndex), ...additions, ...listItems.slice(bottomIndex)];
}

export interface StructuralTypeSearchGroup {
    typeId: TpsNavigatorLineTypeId;
    label: string;
    rows: readonly NavigatorProvidedRow[];
    /** Sorted/grouped form of the same rows, excluding no search matches. */
    presentedItems?: readonly ListPaneItem[];
}

/**
 * Adds mixed structural search results after native file matches. Type headers provide provenance;
 * repeated source paths intentionally count rows and downstream group actions de-duplicate files.
 */
export function appendStructuralTypeSearchGroups(listItems: ListPaneItem[], groups: readonly StructuralTypeSearchGroup[]): ListPaneItem[] {
    const visibleGroups = groups.filter(group => group.rows.length > 0);
    if (visibleGroups.length === 0) {
        return listItems;
    }

    const bottomIndex = listItems.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
    const insertionIndex = bottomIndex === -1 ? listItems.length : bottomIndex;
    const prefix = listItems.slice(0, insertionIndex);
    const suffix = listItems.slice(insertionIndex);
    const additions: ListPaneItem[] = [];
    const seenKeys = new Set(listItems.map(item => item.key));

    visibleGroups.forEach(group => {
        const uniqueRows = group.rows.filter(row => {
            const key = `provider:${row.providerId}:${row.id}`;
            if (seenKeys.has(key)) {
                return false;
            }
            seenKeys.add(key);
            return true;
        });
        if (uniqueRows.length === 0) {
            return;
        }
        const uniqueRowKeys = new Set(uniqueRows.map(row => `provider:${row.providerId}:${row.id}`));
        const headerKey = `search-type-header:${group.typeId}`;
        if (prefix.length > 1 || additions.length > 0) {
            additions.push({ type: ListPaneItemType.HEADER_SPACER, data: '', key: `${headerKey}:spacer` });
        }
        additions.push({
            type: ListPaneItemType.HEADER,
            data: group.label,
            key: headerKey,
            headerKind: 'section',
            groupFilePaths: uniqueRows.map(row => row.sourcePath)
        });
        if (group.presentedItems) {
            group.presentedItems.forEach(item => {
                if (item.type === ListPaneItemType.TOP_SPACER || item.type === ListPaneItemType.BOTTOM_SPACER) {
                    return;
                }
                if (
                    item.type === ListPaneItemType.PROVIDER_ROW &&
                    typeof item.data === 'object' &&
                    !uniqueRowKeys.has(
                        `provider:${(item.data as NavigatorProvidedRow).providerId}:${(item.data as NavigatorProvidedRow).id}`
                    )
                ) {
                    return;
                }
                additions.push({
                    ...item,
                    key: `search-type:${group.typeId}:${item.key}`,
                    ...(item.type === ListPaneItemType.PROVIDER_ROW ? { providerTypeId: group.typeId } : {})
                });
            });
            return;
        }
        uniqueRows.forEach(row => {
            const key = `provider:${row.providerId}:${row.id}`;
            additions.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key, providerTypeId: group.typeId });
        });
    });

    return [...prefix, ...additions, ...suffix];
}
