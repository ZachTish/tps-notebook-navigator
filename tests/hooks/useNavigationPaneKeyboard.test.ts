import { describe, expect, it } from 'vitest';
import { isSelectableNavigationItem } from '../../src/hooks/useNavigationPaneKeyboard';
import { NavigationPaneItemType, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { VirtualFolderItem } from '../../src/types/virtualization';

function createVirtualFolder(id: string, overrides: Partial<VirtualFolderItem> = {}): VirtualFolderItem {
    return {
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: { id, name: id },
        key: id,
        level: 0,
        hasChildren: true,
        ...overrides
    };
}

describe('Types keyboard navigation', () => {
    it('makes the Types root reachable when its builder marks it selectable', () => {
        expect(isSelectableNavigationItem(createVirtualFolder(TYPES_ROOT_VIRTUAL_FOLDER_ID, { isSelectable: true }))).toBe(true);
    });

    it('does not make unrelated virtual headers keyboard selections', () => {
        expect(isSelectableNavigationItem(createVirtualFolder('unrelated', { isSelectable: true }))).toBe(false);
    });

    it('keeps descriptor-backed Type rows keyboard selectable', () => {
        expect(
            isSelectableNavigationItem(
                createVirtualFolder('tps-type:structural:task', {
                    isSelectable: true,
                    typeCollectionId: 'structural:task',
                    hasChildren: false
                })
            )
        ).toBe(true);
    });
});
