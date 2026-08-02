/* TPS Notebook Navigator - pure list routing for file-backed and row-backed Types. */

import type { App, TFile } from 'obsidian';
import { ItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import {
    isTpsNavigatorFileTypeId,
    isTpsNavigatorLineTypeId,
    parseTpsNavigatorProviderTypeId,
    type TpsNavigatorTypeId
} from '../../types/navigatorTypes';
import {
    appendProviderRowsToStandaloneList,
    appendStructuralTypeSearchGroups,
    buildStandaloneProviderListItems,
    mergeProviderRowsIntoList,
    type StructuralTypeSearchGroup
} from '../../services/rows/providerListItems';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import { isFileInTpsNavigatorType } from '../../services/types/vaultFileTypes';

export interface TypeListMode {
    isTypeSelection: boolean;
    isFileBackedTypeSelection: boolean;
    isLineBackedTypeSelection: boolean;
    isProviderOwnedTypeSelection: boolean;
}

export function resolveTypeListMode(selectionType: ItemType | null, selectedType: TpsNavigatorTypeId | null): TypeListMode {
    const isTypeSelection = selectionType === ItemType.TYPE && selectedType !== null;
    return {
        isTypeSelection,
        isFileBackedTypeSelection: isTypeSelection && isTpsNavigatorFileTypeId(selectedType),
        isLineBackedTypeSelection: isTypeSelection && isTpsNavigatorLineTypeId(selectedType),
        isProviderOwnedTypeSelection: isTypeSelection && parseTpsNavigatorProviderTypeId(selectedType) !== null
    };
}

/** Applies the selected file bucket only after normal Navigator visibility has produced the input scope. */
export function collectFileBackedTypeFiles(app: App, visibleFiles: readonly TFile[], selectedType: TpsNavigatorTypeId | null): TFile[] {
    if (!selectedType || !isTpsNavigatorFileTypeId(selectedType)) {
        return [];
    }
    return visibleFiles.filter(file => isFileInTpsNavigatorType(app, file, selectedType));
}

interface ComposeTypeListItemsArgs {
    mode: TypeListMode;
    coreListItems: ListPaneItem[];
    typeRows: readonly NavigatorProvidedRow[];
    providerRows: readonly NavigatorProvidedRow[];
    presentedTypeListItems?: readonly ListPaneItem[];
    searchTypeGroups?: readonly StructuralTypeSearchGroup[];
    globalTypeSearch?: boolean;
}

/**
 * File-backed Types keep the native file pipeline output. Source-backed and
 * provider-owned Types remain standalone provider-row collections.
 */
export function composeTypeListItems({
    mode,
    coreListItems,
    typeRows,
    providerRows,
    presentedTypeListItems,
    searchTypeGroups = [],
    globalTypeSearch = false
}: ComposeTypeListItemsArgs): ListPaneItem[] {
    if (globalTypeSearch || !mode.isTypeSelection || mode.isFileBackedTypeSelection) {
        const merged = mergeProviderRowsIntoList(coreListItems, providerRows);
        return searchTypeGroups.length === 0 ? merged : appendStructuralTypeSearchGroups(merged, searchTypeGroups);
    }
    if (mode.isLineBackedTypeSelection && presentedTypeListItems) {
        return appendProviderRowsToStandaloneList(presentedTypeListItems, providerRows);
    }
    return mode.isProviderOwnedTypeSelection
        ? buildStandaloneProviderListItems([], [...typeRows, ...providerRows])
        : buildStandaloneProviderListItems(typeRows, providerRows);
}
