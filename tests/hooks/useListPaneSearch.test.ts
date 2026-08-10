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

import { describe, expect, it } from 'vitest';
import { App, TFolder } from 'obsidian';
import { ShortcutStartType } from '../../src/types/shortcuts';
import {
    getSearchActivationQuery,
    getTypeFacetQueryWithNavigationSelection,
    includeNavigationSelectionInSearchQuery,
    resolveSearchShortcutStartFolderPath
} from '../../src/hooks/useListPaneSearch';
import { ItemType, UNTAGGED_TAG_ID } from '../../src/types';
import { buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { updateFilterQueryWithTag, updateFilterQueryWithType } from '../../src/utils/filterSearch';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

interface TestVaultRegistration {
    registerFolder(folder: TFolder): void;
}

function getTestVault(app: App): TestVaultRegistration {
    return app.vault as unknown as TestVaultRegistration;
}

describe('resolveSearchShortcutStartFolderPath', () => {
    it('resolves folder start targets with mismatched casing', () => {
        const app = new App();
        getTestVault(app).registerFolder(new TFolder('applab/skills-workflows/mmgi'));

        expect(
            resolveSearchShortcutStartFolderPath(app, {
                type: ShortcutStartType.FOLDER,
                path: 'appLab/SKILLS-WORKFLOWS/mmgi'
            })
        ).toBe('applab/skills-workflows/mmgi');
    });
});

describe('search-bar navigation source of truth', () => {
    it('shows the selected Checkboxes Type as soon as Search opens', () => {
        expect(
            getSearchActivationQuery('', {
                selectionType: ItemType.TYPE,
                selectedTag: null,
                selectedProperty: null,
                selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            })
        ).toBe('type:structural:task');
    });

    it('includes the selected property value before a Type facet is added', () => {
        const query = includeNavigationSelectionInSearchQuery('type:structural:task', {
            selectionType: ItemType.PROPERTY,
            selectedTag: null,
            selectedProperty: buildPropertyValueNodeId('status', 'todo'),
            selectedType: null
        });

        expect(query).toBe('type:structural:task .status=todo');
        expect(
            includeNavigationSelectionInSearchQuery(query, {
                selectionType: ItemType.PROPERTY,
                selectedTag: null,
                selectedProperty: buildPropertyValueNodeId('status', 'todo'),
                selectedType: null
            })
        ).toBe(query);
    });

    it('represents the selected Untagged collection explicitly and idempotently', () => {
        const selection = {
            selectionType: ItemType.TAG,
            selectedTag: UNTAGGED_TAG_ID,
            selectedProperty: null,
            selectedType: null
        } as const;

        expect(includeNavigationSelectionInSearchQuery('type:structural:task', selection)).toBe('type:structural:task -#');
        expect(includeNavigationSelectionInSearchQuery('type:structural:task -#', selection)).toBe('type:structural:task -#');
    });

    it('keeps a selected tag as the source scope when adding an exact-line Type facet', () => {
        const selection = {
            selectionType: ItemType.TAG,
            selectedTag: 'projects/active',
            selectedProperty: null,
            selectedType: null
        } as const;

        const baseQuery = getTypeFacetQueryWithNavigationSelection('', selection);
        expect(baseQuery).toBe('');
        expect(updateFilterQueryWithType(baseQuery, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES).query).toBe('type:structural:task');
    });

    it('includes the selected Checkboxes Type before adding a tag facet', () => {
        const selectedTypeQuery = includeNavigationSelectionInSearchQuery('', {
            selectionType: ItemType.TYPE,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
        });

        expect(updateFilterQueryWithTag(selectedTypeQuery, 'hca', 'AND').query).toBe('type:structural:task #hca');
    });
});
