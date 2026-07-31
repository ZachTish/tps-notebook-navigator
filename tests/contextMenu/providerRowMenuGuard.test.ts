/* TPS Notebook Navigator - provider-row context-menu event ownership. */

import { describe, expect, it, vi } from 'vitest';
import { ItemType } from '../../src/types';
import { EMPTY_LIST_MENU_TYPE } from '../../src/utils/contextMenu/menuTypes';
import { consumeProviderRowEmptyListContextMenu } from '../../src/utils/contextMenu/providerRowMenuGuard';

function contextMenuEvent() {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
    };
}

function closestTarget(providerRowMatch: boolean) {
    const providerRow = providerRowMatch ? ({} as Element) : null;
    return {
        closest: vi.fn().mockReturnValue(providerRow)
    };
}

describe('consumeProviderRowEmptyListContextMenu', () => {
    it('consumes a desktop right-click on a provider row before the empty-list menu can open', () => {
        const event = contextMenuEvent();
        const target = closestTarget(true);

        expect(consumeProviderRowEmptyListContextMenu(event, EMPTY_LIST_MENU_TYPE, target)).toBe(true);
        expect(target.closest).toHaveBeenCalledWith('.tps-nn-provider-row');
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it('consumes the contextmenu emitted by a mobile long-press on a nested provider control', () => {
        const event = contextMenuEvent();
        const nestedControl = closestTarget(true);

        expect(consumeProviderRowEmptyListContextMenu(event, EMPTY_LIST_MENU_TYPE, nestedControl)).toBe(true);
        expect(nestedControl.closest).toHaveBeenCalledWith('.tps-nn-provider-row');
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });

    it('leaves normal empty-list targets available to the surrounding list menu', () => {
        const event = contextMenuEvent();
        const target = closestTarget(false);

        expect(consumeProviderRowEmptyListContextMenu(event, EMPTY_LIST_MENU_TYPE, target)).toBe(false);
        expect(target.closest).toHaveBeenCalledWith('.tps-nn-provider-row');
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
    });

    it('does not consume a provider target when a specific item menu owns the event', () => {
        const event = contextMenuEvent();
        const target = closestTarget(true);

        expect(consumeProviderRowEmptyListContextMenu(event, ItemType.FILE, target)).toBe(false);
        expect(target.closest).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
    });

    it('does not consume an event without an element target', () => {
        const event = contextMenuEvent();

        expect(consumeProviderRowEmptyListContextMenu(event, EMPTY_LIST_MENU_TYPE, null)).toBe(false);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
    });
});
