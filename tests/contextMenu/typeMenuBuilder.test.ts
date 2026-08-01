/* TPS Notebook Navigator - Type collection context-menu routing tests. */

import { Menu } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API } from '../../src/api/NotebookNavigatorAPI';
import type { NavigatorTypeDescriptor } from '../../src/api/types';
import { showTypeCollectionContextMenu } from '../../src/utils/contextMenu/typeMenuBuilder';

const descriptor: NavigatorTypeDescriptor = Object.freeze({
    id: 'kind:Project',
    label: 'Project',
    icon: 'lucide-folder-kanban',
    category: 'kind'
});

function createEvent() {
    return {
        nativeEvent: {} as MouseEvent,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
    };
}

function createPlugin(descriptors: readonly NavigatorTypeDescriptor[], addedItems: number) {
    const applyTypeMenuExtensions = vi.fn((_context: { menu: Menu; typeId: string; descriptor: NavigatorTypeDescriptor }) => addedItems);
    const getSnapshot = vi.fn(() => ({ availability: 'ready', descriptors, revision: 1 }));
    return {
        plugin: {
            api: {
                types: { getSnapshot },
                [INTERNAL_NOTEBOOK_NAVIGATOR_API]: {
                    menus: { applyTypeMenuExtensions }
                }
            }
        },
        applyTypeMenuExtensions,
        getSnapshot
    };
}

let showAtMouseEvent: ReturnType<typeof vi.fn>;

beforeEach(() => {
    showAtMouseEvent = vi.fn();
    Object.assign(Menu.prototype, { showAtMouseEvent });
});

afterEach(() => {
    delete (Menu.prototype as { showAtMouseEvent?: unknown }).showAtMouseEvent;
    vi.restoreAllMocks();
});

describe('Type collection context menus', () => {
    it('resolves the current descriptor and opens registered actions at the native contextmenu event', () => {
        const { plugin, applyTypeMenuExtensions, getSnapshot } = createPlugin([descriptor], 1);
        const event = createEvent();

        expect(
            showTypeCollectionContextMenu({
                event: event as never,
                plugin: plugin as never,
                typeId: 'kind:Project'
            })
        ).toBe(true);

        expect(getSnapshot).toHaveBeenCalledOnce();
        const appliedContext = applyTypeMenuExtensions.mock.calls[0]?.[0];
        expect(appliedContext?.menu).toBeInstanceOf(Menu);
        expect(appliedContext).toMatchObject({
            typeId: 'kind:Project',
            descriptor
        });
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        expect(showAtMouseEvent).toHaveBeenCalledWith(event.nativeEvent);
    });

    it('does not consume the event or open a blank menu when no extension adds an item', () => {
        const { plugin, applyTypeMenuExtensions } = createPlugin([descriptor], 0);
        const event = createEvent();

        expect(
            showTypeCollectionContextMenu({
                event: event as never,
                plugin: plugin as never,
                typeId: 'kind:Project'
            })
        ).toBe(false);

        expect(applyTypeMenuExtensions).toHaveBeenCalledOnce();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
        expect(showAtMouseEvent).not.toHaveBeenCalled();
    });

    it('fails closed when the Type has been unregistered before the menu opens', () => {
        const { plugin, applyTypeMenuExtensions } = createPlugin([], 1);
        const event = createEvent();

        expect(
            showTypeCollectionContextMenu({
                event: event as never,
                plugin: plugin as never,
                typeId: 'kind:Project'
            })
        ).toBe(false);

        expect(applyTypeMenuExtensions).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopPropagation).not.toHaveBeenCalled();
        expect(showAtMouseEvent).not.toHaveBeenCalled();
    });
});
