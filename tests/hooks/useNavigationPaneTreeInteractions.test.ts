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

import React from 'react';
import { App, Platform, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { ItemType } from '../../src/types';
import type { IPropertyTreeProvider } from '../../src/interfaces/IPropertyTreeProvider';
import type { PropertyTreeNode, TagTreeNode } from '../../src/types/storage';
import type { SelectionState } from '../../src/context/SelectionContext';
import {
    useNavigationPaneTreeInteractions,
    type NavigationPaneTreeInteractionsResult
} from '../../src/hooks/navigationPane/useNavigationPaneTreeInteractions';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { createTestTFile } from '../utils/createTestTFile';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypesSnapshot } from '../../src/types/navigatorTypes';

function createPropertyValueNode(key: string, valuePath: string, name: string, notes: string[]): PropertyTreeNode {
    return {
        id: buildPropertyValueNodeId(key, valuePath),
        kind: 'value',
        key,
        valuePath,
        name,
        displayPath: name,
        children: new Map(),
        notesWithValue: new Set(notes)
    };
}

function createPropertyKeyNode(key: string, name: string, notes: string[], values: PropertyTreeNode[] = []): PropertyTreeNode {
    const node: PropertyTreeNode = {
        id: buildPropertyKeyNodeId(key),
        kind: 'key',
        key,
        valuePath: null,
        name,
        displayPath: name,
        children: new Map(),
        notesWithValue: new Set(notes)
    };

    values.forEach(valueNode => {
        node.children.set(valueNode.id, valueNode);
    });

    return node;
}

function createSelectionState(): SelectionState {
    return {
        selectionType: ItemType.FOLDER,
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        selectedFiles: new Set(),
        selectedRow: null,
        anchorIndex: null,
        lastMovementDirection: null,
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: false,
        isFolderNavigation: false,
        selectedFile: null,
        revealSource: null,
        navigationHistory: [],
        navigationHistoryIndex: -1
    };
}

interface TestVaultMethods {
    registerFile(file: ReturnType<typeof createTestTFile>): void;
    registerFolder(folder: TFolder): void;
}

function getTestVault(app: App): App['vault'] & TestVaultMethods {
    return app.vault as App['vault'] & TestVaultMethods;
}

function createTestFolder(app: App, path: string): TFolder {
    const folder = new TFolder(path) as TFolder & {
        children: ReturnType<typeof createTestTFile>[];
        name: string;
        parent: TFolder | null;
        vault: App['vault'];
    };
    folder.children = [];
    folder.name = path.split('/').pop() ?? path;
    folder.parent = null;
    folder.vault = app.vault;
    getTestVault(app).registerFolder(folder);
    return folder;
}

function addFolderNote(app: App, folder: TFolder, path: string): void {
    const file = createTestTFile(path) as ReturnType<typeof createTestTFile> & { parent: TFolder; vault: App['vault'] };
    file.parent = folder;
    file.vault = app.vault;
    (folder as TFolder & { children: ReturnType<typeof createTestTFile>[] }).children.push(file);
    getTestVault(app).registerFile(file);
}

function addChildFolder(app: App, folder: TFolder, path: string): TFolder {
    const childFolder = createTestFolder(app, path) as TFolder & { parent: TFolder };
    childFolder.parent = folder;
    folder.children.push(childFolder);
    return childFolder;
}

const EMPTY_TYPE_SNAPSHOT: TpsNavigatorTypesSnapshot = {
    availability: 'ready',
    descriptors: [],
    recordsByType: new Map(),
    revision: 0
};

function renderTreeInteractionHarness(options?: {
    app?: App;
    settings?: NotebookNavigatorSettings;
    tagTree?: Map<string, TagTreeNode>;
    propertyTree?: Map<string, PropertyTreeNode>;
    typeSnapshot?: TpsNavigatorTypesSnapshot;
    selectionDispatch?: ReturnType<typeof vi.fn>;
    onModifySearchWithTag?: ReturnType<typeof vi.fn>;
    onModifySearchWithProperty?: ReturnType<typeof vi.fn>;
    onModifySearchWithType?: ReturnType<typeof vi.fn>;
    onResetSearchForNavigation?: ReturnType<typeof vi.fn>;
}) {
    const selectionDispatch = options?.selectionDispatch ?? vi.fn();
    const onModifySearchWithTag = options?.onModifySearchWithTag ?? vi.fn();
    const onModifySearchWithProperty = options?.onModifySearchWithProperty ?? vi.fn();
    const onModifySearchWithType = options?.onModifySearchWithType ?? vi.fn();
    const onResetSearchForNavigation = options?.onResetSearchForNavigation ?? vi.fn();
    let captured: NavigationPaneTreeInteractionsResult | null = null;

    function Harness() {
        captured = useNavigationPaneTreeInteractions({
            app: options?.app ?? new App(),
            commandQueue: null,
            settings: options?.settings ?? DEFAULT_SETTINGS,
            uiState: { singlePane: false },
            expansionState: {
                expandedFolders: new Set(),
                expandedTags: new Set(),
                expandedProperties: new Set(),
                expandedVirtualFolders: new Set()
            },
            expansionDispatch: vi.fn(),
            selectionState: createSelectionState(),
            selectionDispatch,
            uiDispatch: vi.fn(),
            propertyTreeService: null,
            tagTree: options?.tagTree ?? new Map<string, TagTreeNode>(),
            propertyTree: options?.propertyTree ?? new Map<string, PropertyTreeNode>(),
            typeSnapshot: options?.typeSnapshot ?? EMPTY_TYPE_SNAPSHOT,
            tagsVirtualFolderHasChildren: false,
            setShortcutsExpanded: vi.fn(),
            setRecentNotesExpanded: vi.fn(),
            clearActiveShortcut: vi.fn(),
            openFolderNoteInRightSidebar: vi.fn(),
            onModifySearchWithTag,
            onModifySearchWithProperty,
            onModifySearchWithType,
            onResetSearchForNavigation
        });
        return null;
    }

    renderToStaticMarkup(React.createElement(Harness));
    if (!captured) {
        throw new Error('Expected hook result');
    }

    return {
        result: captured as NavigationPaneTreeInteractionsResult,
        selectionDispatch,
        onModifySearchWithTag,
        onModifySearchWithProperty,
        onModifySearchWithType,
        onResetSearchForNavigation
    };
}

describe('useNavigationPaneTreeInteractions', () => {
    it('turns a Shift-clicked property key into an explicit empty-value search facet', () => {
        const previousIsMobile = Platform.isMobile;
        const previousIsTablet = Platform.isTablet;
        Platform.isMobile = false;
        Platform.isTablet = false;

        const onModifySearchWithProperty = vi.fn();
        const onResetSearchForNavigation = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const propertyNode = createPropertyKeyNode('status', 'Status', ['notes/empty.md']);
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app: new App(),
                commandQueue: null,
                settings: DEFAULT_SETTINGS,
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch: vi.fn(),
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map([[propertyNode.key, propertyNode]]),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty,
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation
            });
            return null;
        }

        try {
            renderToStaticMarkup(React.createElement(Harness));

            if (!captured) {
                throw new Error('Expected hook result');
            }
            const result = captured as NavigationPaneTreeInteractionsResult;
            result.handlePropertyClick(propertyNode, {
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: true,
                preventDefault,
                stopPropagation
            } as unknown as React.MouseEvent);

            expect(onModifySearchWithProperty).toHaveBeenCalledWith('status', '', 'AND');
            expect(onResetSearchForNavigation).not.toHaveBeenCalled();
            expect(preventDefault).toHaveBeenCalledTimes(1);
            expect(stopPropagation).toHaveBeenCalledTimes(1);
        } finally {
            Platform.isMobile = previousIsMobile;
            Platform.isTablet = previousIsTablet;
        }
    });

    it('turns a Shift-clicked structural Type into a search facet without changing navigation selection', () => {
        const previousIsMobile = Platform.isMobile;
        const previousIsTablet = Platform.isTablet;
        Platform.isMobile = false;
        Platform.isTablet = false;

        const selectionDispatch = vi.fn();
        const onModifySearchWithType = vi.fn();
        const onResetSearchForNavigation = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const typeId = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
        const typeSnapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            descriptors: [
                {
                    id: typeId,
                    label: 'Checkboxes',
                    icon: 'lucide-square-check-big',
                    category: 'structure',
                    count: 0
                }
            ],
            recordsByType: new Map([[typeId, []]]),
            revision: 1
        };
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app: new App(),
                commandQueue: null,
                settings: DEFAULT_SETTINGS,
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch,
                uiDispatch: vi.fn(),
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                typeSnapshot,
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType,
                onResetSearchForNavigation
            });
            return null;
        }

        try {
            renderToStaticMarkup(React.createElement(Harness));

            expect(captured).not.toBeNull();
            if (!captured) {
                throw new Error('Expected hook result');
            }
            const result = captured as NavigationPaneTreeInteractionsResult;

            result.handleTypeClick(typeId, {
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: true,
                preventDefault,
                stopPropagation
            } as unknown as React.MouseEvent);

            expect(onModifySearchWithType).toHaveBeenCalledWith(typeId);
            expect(onResetSearchForNavigation).not.toHaveBeenCalled();
            expect(selectionDispatch).not.toHaveBeenCalled();
            expect(preventDefault).toHaveBeenCalledTimes(1);
            expect(stopPropagation).toHaveBeenCalledTimes(1);
        } finally {
            Platform.isMobile = previousIsMobile;
            Platform.isTablet = previousIsTablet;
        }
    });

    it('resets search before ordinary folder, tag, property, property-root, and Type selections', () => {
        const app = new App();
        const folder = createTestFolder(app, 'Projects');
        const folderHarness = renderTreeInteractionHarness({ app });
        folderHarness.result.handleFolderClick(folder);
        expect(folderHarness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(folderHarness.selectionDispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_FOLDER', folder });

        const tagNode: TagTreeNode = {
            name: 'work',
            path: 'work',
            displayPath: 'Work',
            children: new Map(),
            notesWithTag: new Set()
        };
        const tagHarness = renderTreeInteractionHarness({ tagTree: new Map([[tagNode.path, tagNode]]) });
        tagHarness.result.handleTagClick(tagNode.path, {} as React.MouseEvent);
        expect(tagHarness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(tagHarness.selectionDispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_TAG', tag: tagNode.path });

        const propertyNode = createPropertyKeyNode('status', 'Status', []);
        const propertyHarness = renderTreeInteractionHarness({ propertyTree: new Map([[propertyNode.key, propertyNode]]) });
        propertyHarness.result.handlePropertyClick(propertyNode, {} as React.MouseEvent);
        expect(propertyHarness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(propertyHarness.selectionDispatch).toHaveBeenCalledWith({
            type: 'SET_SELECTED_PROPERTY',
            nodeId: propertyNode.id,
            source: undefined
        });

        const propertyRootHarness = renderTreeInteractionHarness();
        propertyRootHarness.result.handlePropertyCollectionClick({} as React.MouseEvent<HTMLDivElement>);
        expect(propertyRootHarness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(propertyRootHarness.selectionDispatch).toHaveBeenCalledWith({
            type: 'SET_SELECTED_PROPERTY',
            nodeId: 'properties-root'
        });

        const typeId = TPS_NAVIGATOR_TYPE_IDS.NOTES;
        const typeSnapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            descriptors: [{ id: typeId, label: 'Notes', icon: 'lucide-file-text', category: 'structure', count: 0 }],
            recordsByType: new Map([[typeId, []]]),
            revision: 1
        };
        const typeHarness = renderTreeInteractionHarness({
            settings: { ...DEFAULT_SETTINGS, tpsTypesNavigationEnabled: true },
            typeSnapshot
        });
        typeHarness.result.handleTypeClick(typeId);
        expect(typeHarness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(typeHarness.selectionDispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_TYPE', typeId, source: undefined });
    });

    it('preserves search for modifier-added tag and file-backed Type facets', () => {
        const previousIsMobile = Platform.isMobile;
        const previousIsTablet = Platform.isTablet;
        Platform.isMobile = false;
        Platform.isTablet = false;

        try {
            const tagNode: TagTreeNode = {
                name: 'work',
                path: 'work',
                displayPath: 'Work',
                children: new Map(),
                notesWithTag: new Set()
            };
            const tagHarness = renderTreeInteractionHarness({ tagTree: new Map([[tagNode.path, tagNode]]) });
            tagHarness.result.handleTagClick(tagNode.path, {
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: true,
                preventDefault: vi.fn(),
                stopPropagation: vi.fn()
            } as unknown as React.MouseEvent);
            expect(tagHarness.onModifySearchWithTag).toHaveBeenCalledWith(tagNode.path, 'AND');
            expect(tagHarness.onResetSearchForNavigation).not.toHaveBeenCalled();
            expect(tagHarness.selectionDispatch).not.toHaveBeenCalled();

            const typeId = TPS_NAVIGATOR_TYPE_IDS.NOTES;
            const typeHarness = renderTreeInteractionHarness();
            typeHarness.result.handleTypeClick(typeId, {
                altKey: false,
                ctrlKey: false,
                metaKey: false,
                shiftKey: true,
                preventDefault: vi.fn(),
                stopPropagation: vi.fn()
            } as unknown as React.MouseEvent);
            expect(typeHarness.onModifySearchWithType).toHaveBeenCalledWith(typeId);
            expect(typeHarness.onResetSearchForNavigation).not.toHaveBeenCalled();
            expect(typeHarness.selectionDispatch).not.toHaveBeenCalled();
        } finally {
            Platform.isMobile = previousIsMobile;
            Platform.isTablet = previousIsTablet;
        }
    });

    it('does not reset search when a Type selection cannot be resolved', () => {
        const harness = renderTreeInteractionHarness({ settings: { ...DEFAULT_SETTINGS, tpsTypesNavigationEnabled: true } });
        harness.result.handleTypeClick(TPS_NAVIGATOR_TYPE_IDS.NOTES);
        expect(harness.onResetSearchForNavigation).not.toHaveBeenCalled();
        expect(harness.selectionDispatch).not.toHaveBeenCalled();
    });

    it('uses the property tree provider cache for global descendant expansion', () => {
        const childNode = createPropertyValueNode('status', 'open', 'Open', ['notes/a.md']);
        const keyNode = createPropertyKeyNode('status', 'Status', ['notes/a.md'], []);
        const propertyTree = new Map<string, PropertyTreeNode>([[keyNode.key, keyNode]]);
        const collectDescendantNodeIds = vi.fn(() => new Set([childNode.id]));
        const expansionDispatch = vi.fn();

        const propertyTreeProvider: IPropertyTreeProvider = {
            hasNodes: () => true,
            addTreeUpdateListener: () => () => {},
            findNode: nodeId => (nodeId === keyNode.id ? keyNode : null),
            getKeyNode: normalizedKey => (normalizedKey === keyNode.key ? keyNode : null),
            resolveSelectionNodeId: nodeId => nodeId,
            collectDescendantNodeIds,
            collectFilePaths: () => new Set(),
            collectFilesForKeys: () => new Set()
        };

        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app: new App(),
                commandQueue: null,
                settings: DEFAULT_SETTINGS,
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch,
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch: vi.fn(),
                propertyTreeService: propertyTreeProvider,
                tagTree: new Map(),
                propertyTree,
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handlePropertyToggleAllSiblings(keyNode);

        expect(collectDescendantNodeIds).toHaveBeenCalledWith(keyNode.id);
        expect(expansionDispatch).toHaveBeenCalledWith({
            type: 'TOGGLE_DESCENDANT_PROPERTIES',
            descendantNodeIds: [childNode.id],
            expand: true
        });
    });

    it('expands a folder when its folder note link is selected', () => {
        const app = new App();
        const folder = createTestFolder(app, 'Projects');
        addFolderNote(app, folder, 'Projects/index.md');
        addChildFolder(app, folder, 'Projects/Child');
        const expansionDispatch = vi.fn();
        const openFolderNoteInRightSidebar = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                settings: {
                    ...DEFAULT_SETTINGS,
                    autoExpandNavItems: true,
                    enableFolderNotes: true,
                    folderNoteName: 'index',
                    folderNoteOpenLocation: 'right-sidebar',
                    showNearestFolderNoteInSidebar: false
                },
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch,
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch: vi.fn(),
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar,
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderNameClick(folder);

        expect(expansionDispatch).toHaveBeenCalledWith({
            type: 'TOGGLE_FOLDER_EXPANDED',
            folderPath: folder.path
        });
        expect(openFolderNoteInRightSidebar).toHaveBeenCalledTimes(1);
    });

    it('switches to the list pane when a right-sidebar folder note is clicked in single-pane mode', () => {
        const app = new App();
        const folder = createTestFolder(app, 'Projects');
        addFolderNote(app, folder, 'Projects/index.md');
        const uiDispatch = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableFolderNotes: true,
                    folderNoteName: 'index',
                    folderNoteOpenLocation: 'right-sidebar',
                    showNearestFolderNoteInSidebar: true
                },
                uiState: { singlePane: true },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch,
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderNameClick(folder);

        expect(uiDispatch).toHaveBeenCalledWith({ type: 'ACTIVATE_PANE', target: 'files' });
    });

    it('keeps the current pane when a non-sidebar folder note is clicked in single-pane mode', () => {
        const app = new App();
        app.workspace = {
            getLeaf: vi.fn(() => null)
        } as unknown as App['workspace'];
        const folder = createTestFolder(app, 'Projects');
        addFolderNote(app, folder, 'Projects/index.md');
        const uiDispatch = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableFolderNotes: true,
                    folderNoteName: 'index',
                    folderNoteOpenLocation: 'current-tab',
                    showNearestFolderNoteInSidebar: true
                },
                uiState: { singlePane: true },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch,
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderNameClick(folder);

        expect(uiDispatch).not.toHaveBeenCalledWith({ type: 'ACTIVATE_PANE', target: 'files' });
    });

    it('ignores recursive expansion toggles for a root locked open by hidden-item visibility', () => {
        const app = new App();
        const rootFolder = createTestFolder(app, '/');
        addChildFolder(app, rootFolder, 'Projects');
        const expansionDispatch = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                settings: {
                    ...DEFAULT_SETTINGS,
                    showRootFolder: false
                },
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(['/']),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch,
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch: vi.fn(),
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn(),
                onModifySearchWithType: vi.fn(),
                onResetSearchForNavigation: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderToggleAllSiblings(rootFolder);

        expect(expansionDispatch).not.toHaveBeenCalled();
    });
});
