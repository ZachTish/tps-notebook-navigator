/* TPS Notebook Navigator - provider-row context-menu contract tests. */

import type { Menu, MenuItem } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigatorRowContextMenuContext } from '../../src/api/types';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import {
    buildProviderRowContextMenu,
    showProviderRowContextMenuAtMouseEvent,
    showProviderRowContextMenuAtPosition
} from '../../src/utils/contextMenu/providerRowContextMenu';

interface MenuHarness {
    menu: Menu;
    addItem: ReturnType<typeof vi.fn>;
    showAtMouseEvent: ReturnType<typeof vi.fn>;
    showAtPosition: ReturnType<typeof vi.fn>;
    item: MenuItem;
}

function createMenuHarness(options: { failAddItem?: boolean } = {}): MenuHarness {
    const item = {} as MenuItem;
    const menu = {} as Menu;
    const addItem = vi.fn((configure: (menuItem: MenuItem) => void) => {
        if (options.failAddItem) {
            throw new Error('menu rejected item');
        }
        configure(item);
        return menu;
    });
    const showAtMouseEvent = vi.fn(() => menu);
    const showAtPosition = vi.fn(() => menu);
    Object.assign(menu, { addItem, showAtMouseEvent, showAtPosition });
    return { menu, addItem, showAtMouseEvent, showAtPosition, item };
}

function row(overrides: Partial<NavigatorProvidedRow> = {}): NavigatorProvidedRow {
    return {
        providerId: 'example/tasks',
        id: 'one',
        kind: 'example/task',
        label: 'Review navigator',
        sourcePath: 'Inbox/Tasks.md',
        ...overrides
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('provider row context menus', () => {
    it('exposes one exact frozen identity and applies synchronous menu items', () => {
        const harness = createMenuHarness();
        const configure = vi.fn();
        let captured: NavigatorRowContextMenuContext | undefined;
        const providedRow = row({
            sourceLineNumber: 7,
            contextMenu: context => {
                captured = context;
                context.addItem(configure);
            }
        });

        expect(buildProviderRowContextMenu(harness.menu, providedRow)).toBe(1);
        expect(captured).toBeDefined();
        expect(Object.isFrozen(captured)).toBe(true);
        expect(captured).toMatchObject({
            providerId: 'example/tasks',
            rowId: 'one',
            kind: 'example/task',
            sourcePath: 'Inbox/Tasks.md',
            sourceLineNumber: 7
        });
        expect(captured?.addItem).toBeTypeOf('function');
        expect(Object.keys(captured ?? {}).sort()).toEqual(
            ['addItem', 'kind', 'providerId', 'rowId', 'sourceLineNumber', 'sourcePath'].sort()
        );
        expect(configure).toHaveBeenCalledOnce();
        expect(configure).toHaveBeenCalledWith(harness.item);
    });

    it('omits the optional source line instead of inventing one', () => {
        const harness = createMenuHarness();
        let captured: NavigatorRowContextMenuContext | undefined;

        buildProviderRowContextMenu(
            harness.menu,
            row({
                contextMenu: context => {
                    captured = context;
                }
            })
        );

        expect(captured).toBeDefined();
        expect(Object.prototype.hasOwnProperty.call(captured, 'sourceLineNumber')).toBe(false);
    });

    it('does not show an empty menu for either contextmenu or More actions entry points', () => {
        const pointerHarness = createMenuHarness();
        const buttonHarness = createMenuHarness();
        const providedRow = row({ contextMenu: () => undefined });

        expect(showProviderRowContextMenuAtMouseEvent(pointerHarness.menu, providedRow, {} as MouseEvent)).toBe(false);
        expect(showProviderRowContextMenuAtPosition(buttonHarness.menu, providedRow, { x: 10, y: 20 })).toBe(false);
        expect(pointerHarness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(buttonHarness.showAtPosition).not.toHaveBeenCalled();
    });

    it('shows populated menus at the native contextmenu event and accessible button position', () => {
        const pointerHarness = createMenuHarness();
        const buttonHarness = createMenuHarness();
        const nativeContextMenuEvent = {} as MouseEvent;
        const providedRow = row({
            contextMenu: context => {
                context.addItem(() => undefined);
            }
        });

        expect(showProviderRowContextMenuAtMouseEvent(pointerHarness.menu, providedRow, nativeContextMenuEvent)).toBe(true);
        expect(showProviderRowContextMenuAtPosition(buttonHarness.menu, providedRow, { x: 10, y: 20 })).toBe(true);
        expect(pointerHarness.showAtMouseEvent).toHaveBeenCalledWith(nativeContextMenuEvent);
        expect(buttonHarness.showAtPosition).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('isolates throwing builders and menu hosts without opening a menu', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const builderHarness = createMenuHarness();
        const hostHarness = createMenuHarness({ failAddItem: true });

        expect(
            showProviderRowContextMenuAtMouseEvent(
                builderHarness.menu,
                row({
                    contextMenu: () => {
                        throw new Error('builder failed');
                    }
                }),
                {} as MouseEvent
            )
        ).toBe(false);
        expect(
            showProviderRowContextMenuAtPosition(
                hostHarness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(() => undefined);
                    }
                }),
                { x: 1, y: 2 }
            )
        ).toBe(false);
        expect(builderHarness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(hostHarness.showAtPosition).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('rejects Promise-returning builders and ignores delayed additions', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const harness = createMenuHarness();
        const configure = vi.fn();
        const asynchronousBuilder = (context: NavigatorRowContextMenuContext): unknown =>
            Promise.resolve().then(() => {
                context.addItem(configure);
            });
        const providedRow = row({
            contextMenu: asynchronousBuilder
        });

        expect(showProviderRowContextMenuAtMouseEvent(harness.menu, providedRow, {} as MouseEvent)).toBe(false);
        await Promise.resolve();
        expect(harness.addItem).not.toHaveBeenCalled();
        expect(harness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(configure).not.toHaveBeenCalled();
        const firstWarning: unknown = warn.mock.calls[0]?.[0];
        const secondWarning: unknown = warn.mock.calls[1]?.[0];
        expect(firstWarning).toBe(
            '[TPS Notebook Navigator] Provider row context-menu builder returned a Promise; menu builders must be synchronous.'
        );
        expect(secondWarning).toBe('[TPS Notebook Navigator] Provider row context-menu builder attempted to add items asynchronously.');
    });

    it('isolates a provider item callback and does not show its otherwise blank menu', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const harness = createMenuHarness();

        expect(
            showProviderRowContextMenuAtMouseEvent(
                harness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(() => {
                            throw new Error('item failed');
                        });
                    }
                }),
                {} as MouseEvent
            )
        ).toBe(false);
        expect(harness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
    });
});
