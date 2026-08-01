/*
 * TPS Notebook Navigator - first-class Types navigation section.
 *
 * This adapter is intentionally descriptor-driven. Core navigation knows how
 * to render/select types, while the GCM integration owns entity discovery.
 */

import { useMemo } from 'react';
import { NavigationPaneItemType, TYPES_KINDS_VIRTUAL_FOLDER_ID, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../../types';
import { getTpsNavigatorKindValue, type TpsNavigatorTypeId, type TpsNavigatorTypesSnapshot } from '../../../types/navigatorTypes';
import type { CombinedNavigationItem } from '../../../types/virtualization';

/** Virtual ancestors that must be visible before a selected Type row can render. */
export function getTypeSelectionAncestorIds(typeId: TpsNavigatorTypeId, descriptors?: TpsNavigatorTypesSnapshot['descriptors']): string[] {
    const descriptor = descriptors?.find(candidate => candidate.id === typeId);
    const isKind = descriptor ? descriptor.category === 'kind' : getTpsNavigatorKindValue(typeId) !== null;
    return isKind ? [TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID] : [TYPES_ROOT_VIRTUAL_FOLDER_ID];
}

/** Returns the current set when no reveal work is needed so callers can avoid redundant dispatches. */
export function expandTypeSelectionAncestors(
    expandedVirtualFolders: ReadonlySet<string>,
    typeId: TpsNavigatorTypeId,
    descriptors?: TpsNavigatorTypesSnapshot['descriptors']
): ReadonlySet<string> {
    const ancestorIds = getTypeSelectionAncestorIds(typeId, descriptors);
    if (ancestorIds.every(id => expandedVirtualFolders.has(id))) {
        return expandedVirtualFolders;
    }

    const next = new Set(expandedVirtualFolders);
    ancestorIds.forEach(id => next.add(id));
    return next;
}

export function buildNavigationTypeItems(
    snapshot: TpsNavigatorTypesSnapshot,
    expandedVirtualFolders: ReadonlySet<string>
): CombinedNavigationItem[] {
    const structuralDescriptors = snapshot.descriptors.filter(descriptor => descriptor.category === 'structure');
    const kindDescriptors = snapshot.descriptors.filter(descriptor => descriptor.category === 'kind');
    const items: CombinedNavigationItem[] = [
        {
            type: NavigationPaneItemType.VIRTUAL_FOLDER,
            data: {
                id: TYPES_ROOT_VIRTUAL_FOLDER_ID,
                name: 'Types',
                icon: 'lucide-shapes'
            },
            level: 0,
            key: TYPES_ROOT_VIRTUAL_FOLDER_ID,
            isSelectable: true,
            hasChildren: structuralDescriptors.length > 0 || kindDescriptors.length > 0
        }
    ];

    if (!expandedVirtualFolders.has(TYPES_ROOT_VIRTUAL_FOLDER_ID)) {
        return items;
    }

    structuralDescriptors.forEach(descriptor => {
        const showCount = descriptor.showCount !== false;
        items.push({
            type: NavigationPaneItemType.VIRTUAL_FOLDER,
            data: {
                id: `tps-type:${descriptor.id}`,
                name: descriptor.label,
                icon: descriptor.icon
            },
            level: 1,
            key: descriptor.id,
            typeCollectionId: descriptor.id,
            isSelectable: true,
            hasChildren: false,
            showFileCount: showCount,
            ...(showCount ? { noteCount: { current: descriptor.count, descendants: 0, total: descriptor.count } } : {})
        });
    });

    if (kindDescriptors.length === 0) {
        return items;
    }

    items.push({
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: {
            id: TYPES_KINDS_VIRTUAL_FOLDER_ID,
            name: 'Kinds',
            icon: 'lucide-boxes'
        },
        level: 1,
        key: TYPES_KINDS_VIRTUAL_FOLDER_ID,
        isSelectable: true,
        hasChildren: true
    });

    if (!expandedVirtualFolders.has(TYPES_KINDS_VIRTUAL_FOLDER_ID)) {
        return items;
    }

    kindDescriptors.forEach(descriptor => {
        items.push({
            type: NavigationPaneItemType.VIRTUAL_FOLDER,
            data: {
                id: `tps-type:${descriptor.id}`,
                name: descriptor.label,
                icon: descriptor.icon
            },
            level: 2,
            key: descriptor.id,
            typeCollectionId: descriptor.id,
            isSelectable: true,
            hasChildren: false,
            showFileCount: true,
            noteCount: { current: descriptor.count, descendants: 0, total: descriptor.count }
        });
    });

    return items;
}

/** Fully expanded child rows used as the non-sortable Types preview in root-section reorder mode. */
export function buildNavigationTypeReorderItems(snapshot: TpsNavigatorTypesSnapshot): CombinedNavigationItem[] {
    return buildNavigationTypeItems(snapshot, new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID])).slice(1);
}

export function useNavigationPaneTypeSection(
    snapshot: TpsNavigatorTypesSnapshot,
    expandedVirtualFolders: ReadonlySet<string>,
    enabled = true
): CombinedNavigationItem[] {
    return useMemo(
        () => (enabled ? buildNavigationTypeItems(snapshot, expandedVirtualFolders) : []),
        [enabled, expandedVirtualFolders, snapshot]
    );
}
