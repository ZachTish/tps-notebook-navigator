/* TPS Notebook Navigator - isolated runtime guards for first-party Type collections. */

import { ItemType, type NavigationItemType } from '../../types';

export function supportsCalendarInteractionsForSelection(selectionType: NavigationItemType | null): boolean {
    return selectionType !== ItemType.TYPE;
}

export function shouldCollapseMobileDrawerForTypeProviderActivation(selectionType: NavigationItemType | null, isMobile: boolean): boolean {
    return isMobile && selectionType === ItemType.TYPE;
}
