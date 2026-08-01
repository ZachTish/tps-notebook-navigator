import { describe, expect, it } from 'vitest';
import { buildStandaloneProviderListItems } from '../../src/services/rows/providerListItems';
import { ListPaneItemType } from '../../src/types';

describe('buildStandaloneProviderListItems', () => {
    it('wraps every provider row in stable top and bottom spacers without source-file attachment', () => {
        const rows = [
            {
                providerId: 'tps/types',
                id: 'project:one',
                kind: 'tps/type-row',
                label: 'Project one',
                sourcePath: 'Projects/One.md'
            },
            {
                providerId: 'tps/types',
                id: 'task:two',
                kind: 'tps/type-row',
                label: 'Task two',
                sourcePath: 'Tasks/Two.md'
            }
        ];

        const items = buildStandaloneProviderListItems(rows);

        expect(items.map(item => item.type)).toEqual([
            ListPaneItemType.TOP_SPACER,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(items.map(item => item.key)).toEqual([
            'top-spacer',
            'provider:tps/types:project:one',
            'provider:tps/types:task:two',
            'bottom-spacer'
        ]);
        expect(items[1].data).toBe(rows[0]);
        expect(items[2].data).toBe(rows[1]);
    });

    it('still returns both virtualized boundary spacers for an empty result', () => {
        const items = buildStandaloneProviderListItems([]);

        expect(items).toEqual([
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
        ]);
    });
});
