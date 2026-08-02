/* TPS Notebook Navigator - isolated runtime guards for first-party Type collections. */

import { ItemType, type NavigationItemType } from '../../types';
import { isTpsNavigatorFileTypeId, isTpsNavigatorLineTypeId, type TpsNavigatorTypeId } from '../../types/navigatorTypes';

export function supportsCalendarInteractionsForSelection(selectionType: NavigationItemType | null): boolean {
    return selectionType !== ItemType.TYPE;
}

export function shouldCollapseMobileDrawerForTypeProviderActivation(selectionType: NavigationItemType | null, isMobile: boolean): boolean {
    return isMobile && selectionType === ItemType.TYPE;
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
