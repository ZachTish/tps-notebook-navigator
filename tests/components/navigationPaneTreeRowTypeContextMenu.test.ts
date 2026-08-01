/* TPS Notebook Navigator - navigation Type collection context-menu routing. */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationPaneTreeRow } from '../../src/components/navigationPane/NavigationPaneTreeRow';
import type { NavigationPaneRowContext } from '../../src/components/navigationPane/NavigationPaneItemRenderer.types';
import { NavigationPaneItemType, NavigationSectionId, TYPES_KINDS_VIRTUAL_FOLDER_ID, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import {
    createTpsNavigatorKindTypeId,
    createTpsNavigatorProviderTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeId
} from '../../src/types/navigatorTypes';
import type { VirtualFolderItem } from '../../src/types/virtualization';

interface CapturedVirtualFolderProps {
    onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

const virtualFolderCapture = vi.hoisted(() => ({ current: null as CapturedVirtualFolderProps | null }));

vi.mock('../../src/components/VirtualFolderItem', () => ({
    VirtualFolderComponent: (props: CapturedVirtualFolderProps) => {
        virtualFolderCapture.current = props;
        return null;
    }
}));
vi.mock('../../src/components/FolderItem', () => ({ FolderItem: () => null }));
vi.mock('../../src/components/PropertyTreeItem', () => ({ PropertyTreeItem: () => null }));
vi.mock('../../src/components/TagTreeItem', () => ({ TagTreeItem: () => null }));

const kindTypeId = createTpsNavigatorKindTypeId('project')!;
const externalTypeId = createTpsNavigatorProviderTypeId('example/entities', 'contexts')!;

function createTypeItem(typeId: TpsNavigatorTypeId): VirtualFolderItem {
    return {
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: { id: `tps-type:${typeId}`, name: typeId, icon: 'lucide-box' },
        level: 1,
        key: typeId,
        typeCollectionId: typeId,
        isSelectable: true,
        hasChildren: false
    };
}

function createSectionRoot(id: typeof TYPES_ROOT_VIRTUAL_FOLDER_ID | typeof TYPES_KINDS_VIRTUAL_FOLDER_ID): VirtualFolderItem {
    return {
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: { id, name: id === TYPES_ROOT_VIRTUAL_FOLDER_ID ? 'Types' : 'Kinds', icon: 'lucide-boxes' },
        level: id === TYPES_ROOT_VIRTUAL_FOLDER_ID ? 0 : 1,
        key: id,
        isSelectable: true,
        hasChildren: true
    };
}

function createContext(onTypeContextMenu: NavigationPaneRowContext['onTypeContextMenu']): NavigationPaneRowContext {
    return {
        settings: {},
        isMobile: false,
        indentGuideLevelsByKey: new Map(),
        firstSectionId: null,
        firstInlineFolderPath: null,
        shouldPinShortcuts: false,
        tagCounts: new Map(),
        propertyCounts: new Map(),
        getSolidBackground: () => undefined,
        shortcuts: {},
        shortcutUiState: {},
        tree: {
            handleTypeClick: vi.fn(),
            handleVirtualFolderToggle: vi.fn(),
            handleVirtualFolderToggleAllSiblings: vi.fn()
        },
        searchHighlights: {
            getTagCollectionSearchMatch: () => undefined
        },
        onSectionContextMenu: vi.fn(),
        onTypeContextMenu
    } as unknown as NavigationPaneRowContext;
}

function renderVirtualFolder(item: VirtualFolderItem, context: NavigationPaneRowContext): CapturedVirtualFolderProps {
    renderToStaticMarkup(
        React.createElement(NavigationPaneTreeRow, {
            item,
            context,
            isSelected: false,
            isExpanded: false,
            renameTarget: null,
            isDragSource: false
        })
    );
    expect(virtualFolderCapture.current).not.toBeNull();
    return virtualFolderCapture.current!;
}

describe('NavigationPaneTreeRow Type context menus', () => {
    beforeEach(() => {
        virtualFolderCapture.current = null;
    });

    it.each([
        ['built-in', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES],
        ['Kind', kindTypeId],
        ['external', externalTypeId]
    ] as const)('routes a %s collection row to the Type-specific callback', (_label, typeId) => {
        const onTypeContextMenu = vi.fn();
        const context = createContext(onTypeContextMenu);
        const event = {} as React.MouseEvent<HTMLDivElement>;

        const props = renderVirtualFolder(createTypeItem(typeId), context);
        expect(props.onContextMenu).toBeTypeOf('function');
        props.onContextMenu?.(event);

        expect(onTypeContextMenu).toHaveBeenCalledOnce();
        expect(onTypeContextMenu).toHaveBeenCalledWith(event, typeId);
        expect(context.onSectionContextMenu).not.toHaveBeenCalled();
    });

    it('keeps the Types root on its section menu and the nested Kinds root menu-free', () => {
        const onTypeContextMenu = vi.fn();
        const context = createContext(onTypeContextMenu);
        const event = {} as React.MouseEvent<HTMLDivElement>;

        const typesProps = renderVirtualFolder(createSectionRoot(TYPES_ROOT_VIRTUAL_FOLDER_ID), context);
        expect(typesProps.onContextMenu).toBeTypeOf('function');
        typesProps.onContextMenu?.(event);
        expect(context.onSectionContextMenu).toHaveBeenCalledWith(event, NavigationSectionId.TYPES, { allowSeparator: true });
        expect(onTypeContextMenu).not.toHaveBeenCalled();

        const kindsProps = renderVirtualFolder(createSectionRoot(TYPES_KINDS_VIRTUAL_FOLDER_ID), context);
        expect(kindsProps.onContextMenu).toBeUndefined();
        expect(onTypeContextMenu).not.toHaveBeenCalled();
    });
});
