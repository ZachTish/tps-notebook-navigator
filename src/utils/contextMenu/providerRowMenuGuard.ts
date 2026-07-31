/*
 * TPS Notebook Navigator - provider-row context-menu event ownership.
 */

import { EMPTY_LIST_MENU_TYPE, type MenuConfig } from './menuTypes';

const PROVIDER_ROW_SELECTOR = '.tps-nn-provider-row';

type ContextMenuEventControls = Pick<MouseEvent, 'preventDefault' | 'stopPropagation'>;
type ClosestTarget = Pick<Element, 'closest'>;

/**
 * Prevents transient provider rows from inheriting the list pane's empty-area menu.
 * Browsers route both pointer right-clicks and native mobile long-presses through the
 * same `contextmenu` handler, so consuming the event here protects both paths.
 */
export function consumeProviderRowEmptyListContextMenu(
    event: ContextMenuEventControls,
    menuType: MenuConfig['type'],
    targetElement: ClosestTarget | null
): boolean {
    if (menuType !== EMPTY_LIST_MENU_TYPE || !targetElement?.closest(PROVIDER_ROW_SELECTOR)) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
}
