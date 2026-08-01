/*
 * TPS Notebook Navigator - shared Type navigation resolver.
 *
 * This utility keeps Type validation, ancestor expansion, selection, focus,
 * and scrolling consistent across UI, command, and public API entry points.
 */

import type { ExpansionAction } from '../context/ExpansionContext';
import type { SelectionAction, SelectionRevealSource } from '../context/SelectionContext';
import type { ContentPane } from '../context/UIStateContext';
import { ItemType, TYPES_KINDS_VIRTUAL_FOLDER_ID, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../types';
import {
    createTpsNavigatorKindTypeId,
    getTpsNavigatorKindValue,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypesSnapshot
} from '../types/navigatorTypes';

type Dispatch<T> = (action: T) => void;

export interface NavigateToTypeOptions {
    skipScroll?: boolean;
    source?: SelectionRevealSource;
    preserveNavigationFocus?: boolean;
    skipFocus?: boolean;
    historyIndex?: number;
}

export interface TypeNavigationEnvironment {
    enabled: boolean;
    snapshot: Pick<TpsNavigatorTypesSnapshot, 'availability' | 'descriptors'>;
    expandedVirtualFolders: ReadonlySet<string>;
    expansionDispatch: Dispatch<ExpansionAction>;
    selectionDispatch: Dispatch<SelectionAction>;
    activatePane: (target: ContentPane) => void;
    requestScroll?: (typeId: TpsNavigatorTypeId, options: { align: 'auto'; itemType: typeof ItemType.TYPE }) => void;
}

function canonicalizeTypeId(value: string): TpsNavigatorTypeId | null {
    if (!isTpsNavigatorTypeId(value)) {
        return null;
    }

    const kind = getTpsNavigatorKindValue(value);
    return kind ? createTpsNavigatorKindTypeId(kind) : value;
}

function expandTypeAncestors(env: TypeNavigationEnvironment, typeId: TpsNavigatorTypeId): void {
    const ancestorIds = getTpsNavigatorKindValue(typeId)
        ? [TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID]
        : [TYPES_ROOT_VIRTUAL_FOLDER_ID];
    if (ancestorIds.every(id => env.expandedVirtualFolders.has(id))) {
        return;
    }

    const nextExpanded = new Set(env.expandedVirtualFolders);
    ancestorIds.forEach(id => nextExpanded.add(id));
    env.expansionDispatch({ type: 'SET_EXPANDED_VIRTUAL_FOLDERS', folders: nextExpanded });
}

/**
 * Selects a structural or Kind Type collection and reveals it in navigation.
 *
 * A ready snapshot is authoritative, so a missing descriptor is rejected.
 * During loading or an integration outage, syntactically valid IDs remain
 * navigable so restored and programmatic selections survive transient state.
 */
export function navigateToType(env: TypeNavigationEnvironment, typeId: string, options?: NavigateToTypeOptions): TpsNavigatorTypeId | null {
    if (!env.enabled) {
        return null;
    }

    const canonicalTypeId = canonicalizeTypeId(typeId);
    if (!canonicalTypeId) {
        return null;
    }

    if (env.snapshot.availability === 'ready' && !env.snapshot.descriptors.some(descriptor => descriptor.id === canonicalTypeId)) {
        return null;
    }

    expandTypeAncestors(env, canonicalTypeId);
    env.selectionDispatch({
        type: 'SET_SELECTED_TYPE',
        typeId: canonicalTypeId,
        source: options?.source,
        historyIndex: options?.historyIndex
    });

    if (!options?.skipFocus) {
        const preserveNavigationFocus = options?.preserveNavigationFocus ?? true;
        env.activatePane(preserveNavigationFocus ? 'navigation' : 'files');
    }

    if (!options?.skipScroll && env.requestScroll) {
        env.requestScroll(canonicalTypeId, { align: 'auto', itemType: ItemType.TYPE });
    }

    return canonicalTypeId;
}
