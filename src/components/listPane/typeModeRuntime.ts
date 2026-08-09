/* TPS Notebook Navigator - isolated runtime guards for first-party Type collections. */

import { ItemType, type NavigationItemType } from '../../types';
import { normalizePropertyGroupingSourceForMenu, type ListNoteGroupingOption } from '../../settings/types';
import {
    isTpsNavigatorFileTypeId,
    isTpsNavigatorGcmLineTypeId,
    isTpsNavigatorLineTypeId,
    type TpsNavigatorTypeId
} from '../../types/navigatorTypes';

export function supportsCalendarInteractionsForSelection(selectionType: NavigationItemType | null): boolean {
    return selectionType !== ItemType.TYPE;
}

export function shouldCollapseMobileDrawerForTypeProviderActivation(selectionType: NavigationItemType | null, isMobile: boolean): boolean {
    return isMobile && selectionType === ItemType.TYPE;
}

/** The visible vault root is the mixed all-resources scope, not a direct-child folder query. */
export function isVaultRootResourceScope(
    selectionType: NavigationItemType | null | undefined,
    selectedFolderPath: string | null | undefined
): boolean {
    return selectionType === ItemType.FOLDER && selectedFolderPath === '/';
}

/** Keep ordinary folders preference-driven while making the root represent every visible resource. */
export function resolveIncludeDescendantResources({
    selectionType,
    selectedFolderPath,
    includeDescendants,
    forceWholeVaultSearch = false
}: {
    selectionType: NavigationItemType | null | undefined;
    selectedFolderPath: string | null | undefined;
    includeDescendants: boolean;
    forceWholeVaultSearch?: boolean;
}): boolean {
    return includeDescendants || forceWholeVaultSearch || isVaultRootResourceScope(selectionType, selectedFolderPath);
}

/** Native file presentation controls apply to ordinary scopes and fixed file-backed Types only. */
export function supportsNativeListPresentationForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null
): boolean {
    return selectionType !== ItemType.TYPE || isTpsNavigatorFileTypeId(selectedType);
}

/** Sort/group controls also support fixed line-backed Types through owning-note metadata. */
export function supportsListSortAndGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null
): boolean {
    return selectionType !== ItemType.TYPE || isTpsNavigatorFileTypeId(selectedType) || isTpsNavigatorLineTypeId(selectedType);
}

/** Line properties are available for exact GCM rows and for any scope currently showing mixed structural search results. */
export function supportsLinePropertyGroupingSourceForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    mixedStructuralSearchActive: boolean
): boolean {
    return mixedStructuralSearchActive || (selectionType === ItemType.TYPE && isTpsNavigatorGcmLineTypeId(selectedType));
}

/**
 * Reports the grouping source that the current rendered rows actually use while retaining
 * a latent line-source override for a later mixed search. Native rows and Navigator-owned
 * source ranges use note frontmatter whenever exact GCM line fields are not available.
 */
export function resolveRenderedPropertyGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    groupBy: ListNoteGroupingOption,
    mixedStructuralSearchActive: boolean
): ListNoteGroupingOption {
    return normalizePropertyGroupingSourceForMenu(
        groupBy,
        supportsLinePropertyGroupingSourceForSelection(selectionType, selectedType, mixedStructuralSearchActive)
    );
}

/** Calendar-day property buckets apply to standalone line rows and to structural rows mixed into search. */
export function supportsDayPropertyGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    mixedStructuralSearchActive: boolean
): boolean {
    return mixedStructuralSearchActive || (selectionType === ItemType.TYPE && isTpsNavigatorLineTypeId(selectedType));
}

/**
 * Ordinary scopes retain the existing (possibly disabled) New note control.
 * Type scopes expose it only when the selected Type has a real create action.
 */
export function shouldShowListCreateButton(
    selectionType: NavigationItemType | null,
    canCreateSelectedItem: boolean,
    settingVisible: boolean
): boolean {
    return settingVisible && (selectionType !== ItemType.TYPE || canCreateSelectedItem);
}
