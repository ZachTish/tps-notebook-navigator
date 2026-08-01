/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it, vi } from 'vitest';
import { MenusAPI, type FileMenuExtension, type TypeMenuExtension } from '../../src/api/modules/MenusAPI';
import { TFolder } from 'obsidian';
import type { Menu, MenuItem } from 'obsidian';
import type { NavigatorTypeDescriptor } from '../../src/api/types';
import { createTestTFile } from '../utils/createTestTFile';

type MenuStub = {
    addItem: (cb: (item: MenuItem) => void) => void;
    addSeparator: () => void;
};

function createMenuStub(): { menu: MenuStub; addItem: ReturnType<typeof vi.fn>; addSeparator: ReturnType<typeof vi.fn> } {
    const addItem = vi.fn((cb: (item: MenuItem) => void) => cb({} as MenuItem));
    const addSeparator = vi.fn(() => undefined);
    return { menu: { addItem, addSeparator }, addItem, addSeparator };
}

describe('MenusAPI', () => {
    it('registers and applies file menu extensions with an item count', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();

        const dispose = menusAPI.registerFileMenu(({ addItem: addMenuItem, selection }) => {
            expect(selection.mode).toBe('single');
            expect(Object.isFrozen(selection)).toBe(true);
            expect(Object.isFrozen(selection.files)).toBe(true);

            addMenuItem(() => undefined);
            addMenuItem(() => undefined);
        });

        const added = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(added).toBe(2);
        expect(addItem).toHaveBeenCalledTimes(2);

        dispose();

        const addedAfterDispose = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(addedAfterDispose).toBe(0);
    });

    it('isolates file menu extension failures', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerFileMenu(() => {
            throw new Error('boom');
        });
        menusAPI.registerFileMenu(({ addItem }) => {
            addItem(() => undefined);
        });

        expect(() => {
            const added = menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            });
            expect(added).toBe(1);
        }).not.toThrow();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('isolates folder menu extension failures', () => {
        const menusAPI = new MenusAPI();
        const folder = new TFolder();
        folder.path = 'Folder';
        const { menu } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerFolderMenu(({ addItem }) => {
            addItem(() => {
                throw new Error('item error');
            });
        });

        expect(() => {
            const added = menusAPI.applyFolderMenuExtensions({
                menu: menu as unknown as Menu,
                folder
            });
            expect(added).toBe(0);
        }).not.toThrow();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('registers and applies tag and property menu extensions with item counts', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();

        const disposeTag = menusAPI.registerTagMenu(({ addItem: addMenuItem, tag }) => {
            expect(tag).toBe('work');
            addMenuItem(() => undefined);
        });
        const disposeProperty = menusAPI.registerPropertyMenu(({ addItem: addMenuItem, nodeId }) => {
            expect(nodeId).toBe('key:status');
            addMenuItem(() => undefined);
        });

        expect(
            menusAPI.applyTagMenuExtensions({
                menu: menu as unknown as Menu,
                tag: 'work'
            })
        ).toBe(1);

        expect(
            menusAPI.applyPropertyMenuExtensions({
                menu: menu as unknown as Menu,
                nodeId: 'key:status'
            })
        ).toBe(1);

        expect(addItem).toHaveBeenCalledTimes(2);

        disposeTag();
        disposeProperty();
    });

    it('registers and applies Type menu extensions with an exact immutable descriptor', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const descriptor = {
            id: 'provider:example%2Fentities:projects',
            label: 'Projects',
            icon: 'lucide-folder-kanban',
            category: 'structure',
            providerId: 'example/entities',
            providerCollectionId: 'projects'
        } satisfies NavigatorTypeDescriptor;

        const dispose = menusAPI.registerTypeMenu(context => {
            expect(Object.isFrozen(context)).toBe(true);
            expect(context.typeId).toBe(descriptor.id);
            expect(context.descriptor).toEqual(descriptor);
            expect(context.descriptor).not.toBe(descriptor);
            expect(Object.isFrozen(context.descriptor)).toBe(true);

            context.addItem(() => undefined);
            context.addItem(() => undefined);
        });

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(2);
        expect(addItem).toHaveBeenCalledTimes(2);

        dispose();
        dispose();
        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(0);
    });

    it('isolates throwing and Promise-returning Type menu extensions', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const descriptor = {
            id: 'kind:Project',
            label: 'Project',
            icon: 'lucide-shapes',
            category: 'kind'
        } satisfies NavigatorTypeDescriptor;
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerTypeMenu(() => {
            throw new Error('Type menu failed');
        });
        const promiseReturningExtension = (() => Promise.resolve()) as unknown as TypeMenuExtension;
        menusAPI.registerTypeMenu(promiseReturningExtension);
        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => addMenuItem(() => undefined));

        expect(() => {
            expect(
                menusAPI.applyTypeMenuExtensions({
                    menu: menu as unknown as Menu,
                    typeId: descriptor.id,
                    descriptor
                })
            ).toBe(1);
        }).not.toThrow();
        expect(addItem).toHaveBeenCalledOnce();
        expect(consoleSpy).toHaveBeenCalledTimes(2);

        consoleSpy.mockRestore();
    });

    it('does not count a Type menu item whose initializer fails', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => {
            addMenuItem(() => {
                throw new Error('item failed');
            });
        });

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: 'kind:Project',
                descriptor: {
                    id: 'kind:Project',
                    label: 'Project',
                    icon: 'lucide-shapes',
                    category: 'kind'
                }
            })
        ).toBe(0);
        expect(addItem).toHaveBeenCalledOnce();
        expect(consoleSpy).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });

    it('warns when a menu extension returns a promise', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const promiseReturningExtension = (() => Promise.resolve()) as unknown as FileMenuExtension;
        menusAPI.registerFileMenu(promiseReturningExtension);

        const added = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(added).toBe(0);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
