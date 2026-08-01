import { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { selectionReducer } from '../../src/context/selection/state';
import type { SelectionState } from '../../src/context/selection/types';
import { ItemType } from '../../src/types';
import { createTypeSelectionFallbackAction, resolveTypeSelectionHistoryEntry } from '../../src/utils/navigationTypeHistory';

function createTypeSelectionState(app: App): SelectionState {
    const root = app.vault.getRoot();
    return {
        selectionType: ItemType.TYPE,
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null,
        selectedType: 'kind:Removed',
        selectedFiles: new Set<string>(),
        selectedFile: null,
        anchorIndex: null,
        lastMovementDirection: null,
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: false,
        isFolderNavigation: true,
        revealSource: null,
        navigationHistory: [
            { type: ItemType.FOLDER, value: root.path },
            { type: ItemType.TYPE, value: 'kind:Removed' }
        ],
        navigationHistoryIndex: 1
    };
}

describe('Types navigation history', () => {
    it('skips valid Type history entries while Types navigation is disabled', () => {
        const entry = { type: ItemType.TYPE, value: 'structural:task' } as const;

        expect(resolveTypeSelectionHistoryEntry(entry, false)).toBeNull();
        expect(resolveTypeSelectionHistoryEntry(entry, true)).toEqual(entry);
    });

    it('replaces a removed Kind selection so Back can move past the stale entry', () => {
        const app = new App();
        const state = createTypeSelectionState(app);

        const next = selectionReducer(state, createTypeSelectionFallbackAction(app.vault.getRoot()), app);

        expect(next.selectionType).toBe(ItemType.FOLDER);
        expect(next.selectedType).toBeNull();
        expect(next.navigationHistory).toEqual([{ type: ItemType.FOLDER, value: '/' }]);
        expect(next.navigationHistoryIndex).toBe(0);
    });
});
