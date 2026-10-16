import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { getNavigationPropertyKeySet } from '../../src/utils/vaultProfiles';
import {
    buildPropertyTreeFromDatabase,
    buildPropertyValueNodeId,
    canRestorePropertySelectionNodeId,
    determinePropertyToReveal,
    isPropertyFeatureEnabled
} from '../../src/utils/propertyTree';
import type { FileData } from '../../src/storage/IndexedDBStorage';

describe('all discovered properties in navigation', () => {
    it('does not need a configured key or GCM catalog to enable properties', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.showProperties = true;
        settings.vaultProfiles[0].propertyKeys = [];
        expect(isPropertyFeatureEnabled(settings)).toBe(true);
        const id = buildPropertyValueNodeId('unconfigured', 'example');
        expect(canRestorePropertySelectionNodeId(settings, id)).toBe(true);
        expect(determinePropertyToReveal([{ fieldKey: 'unconfigured', value: 'example' }], null, settings, true)).toBe(id);
        settings.showProperties = false;
        expect(isPropertyFeatureEnabled(settings)).toBe(false);
    });
    it('explicit hides override automatic discovery, independently of list/menu visibility', () => {
        const keys = getNavigationPropertyKeySet(
            [
                { key: 'Secret', showInNavigation: false, showInList: true, showInFileMenu: true },
                { key: 'Status', showInNavigation: true, showInList: false, showInFileMenu: false }
            ],
            ['NewKey', 'Secret', 'status']
        );
        expect([...keys].sort()).toEqual(['newkey', 'status']);
    });
    it('uses existing indexed properties for empty, numeric, nested and object-carrier keys without reads', () => {
        const tree = buildPropertyTreeFromDatabase({
            forEachFile: callback =>
                callback('Note.md', {
                    properties: [
                        { fieldKey: 'NewKey', value: 'one/two' },
                        { fieldKey: 'Blank', value: '' },
                        { fieldKey: 'Count', value: '0', valueKind: 'number' },
                        { fieldKey: 'Object', value: '' }
                    ]
                } as FileData)
        });
        expect([...getNavigationPropertyKeySet([], tree.keys())].sort()).toEqual(['blank', 'count', 'newkey', 'object']);
        expect(tree.get('newkey')?.children.size).toBe(1);
    });
});
