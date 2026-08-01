import { describe, expect, it } from 'vitest';
import { isSelectableNavigationItem } from '../../src/hooks/useNavigationPaneKeyboard';
import { NavigationPaneItemType, TYPES_KINDS_VIRTUAL_FOLDER_ID, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
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
    it.each([TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID])(
        'makes the %s group reachable when its builder marks it selectable',
        folderId => {
            expect(isSelectableNavigationItem(createVirtualFolder(folderId, { isSelectable: true }))).toBe(true);
        }
    );

    it('does not make unrelated virtual headers keyboard selections', () => {
        expect(isSelectableNavigationItem(createVirtualFolder('unrelated', { isSelectable: true }))).toBe(false);
    });

    it('keeps descriptor-backed Type rows keyboard selectable', () => {
        expect(
            isSelectableNavigationItem(
                createVirtualFolder('tps-type:kind:project', {
                    isSelectable: true,
                    typeCollectionId: 'kind:project',
                    hasChildren: false
                })
            )
        ).toBe(true);
    });
});
