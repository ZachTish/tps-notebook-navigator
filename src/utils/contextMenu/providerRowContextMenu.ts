/*
 * TPS Notebook Navigator - isolated provider-row context-menu construction.
 */

import type { Menu, MenuItem } from 'obsidian';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import { isPromiseLike } from '../async';

type ProviderRowMenu = Pick<Menu, 'addItem' | 'showAtMouseEvent' | 'showAtPosition'>;

function warn(message: string, row: NavigatorProvidedRow, error?: unknown): void {
    console.warn(`[TPS Notebook Navigator] ${message}`, {
        providerId: row.providerId,
        rowId: row.id,
        ...(error === undefined ? {} : { error })
    });
}

/**
 * Builds a provider-owned menu synchronously and returns the number of items
 * successfully handed to Obsidian. A provider never receives the Menu itself.
 */
export function buildProviderRowContextMenu(menu: Pick<Menu, 'addItem'>, row: NavigatorProvidedRow): number {
    const builder = row.contextMenu;
    if (!builder) {
        return 0;
    }

    const pendingItems: ((item: MenuItem) => void)[] = [];
    let isBuilding = true;
    const addItem = (configure: (item: MenuItem) => void): void => {
        if (!isBuilding) {
            warn('Provider row context-menu builder attempted to add items asynchronously.', row);
            return;
        }
        if (typeof configure !== 'function') {
            warn('Provider row context-menu builder supplied an invalid item callback.', row);
            return;
        }
        pendingItems.push(configure);
    };
    const identity = {
        providerId: row.providerId,
        rowId: row.id,
        kind: row.kind,
        sourcePath: row.sourcePath,
        ...(row.sourceLineNumber === undefined ? {} : { sourceLineNumber: row.sourceLineNumber }),
        addItem
    };
    const context = Object.freeze(identity);

    try {
        const result: unknown = builder(context);
        isBuilding = false;
        if (isPromiseLike(result)) {
            warn('Provider row context-menu builder returned a Promise; menu builders must be synchronous.', row);
            void Promise.resolve(result).catch(error => {
                warn('Provider row asynchronous context-menu builder failed.', row, error);
            });
            return 0;
        }
    } catch (error) {
        isBuilding = false;
        warn('Provider row context-menu builder failed.', row, error);
        return 0;
    }

    let addedItems = 0;
    for (const configure of pendingItems) {
        try {
            let configured = false;
            menu.addItem(item => {
                try {
                    configure(item);
                    configured = true;
                } catch (error) {
                    warn('Provider row context-menu item failed.', row, error);
                }
            });
            if (configured) {
                addedItems += 1;
            }
        } catch (error) {
            warn('Provider row context-menu addItem failed.', row, error);
        }
    }
    return addedItems;
}

/** Shows a non-empty provider menu at a desktop right-click or native mobile long-press event. */
export function showProviderRowContextMenuAtMouseEvent(menu: ProviderRowMenu, row: NavigatorProvidedRow, event: MouseEvent): boolean {
    if (buildProviderRowContextMenu(menu, row) === 0) {
        return false;
    }
    menu.showAtMouseEvent(event);
    return true;
}

/** Shows a non-empty provider menu beside the accessible More actions button. */
export function showProviderRowContextMenuAtPosition(
    menu: ProviderRowMenu,
    row: NavigatorProvidedRow,
    position: { x: number; y: number }
): boolean {
    if (buildProviderRowContextMenu(menu, row) === 0) {
        return false;
    }
    menu.showAtPosition(position);
    return true;
}
