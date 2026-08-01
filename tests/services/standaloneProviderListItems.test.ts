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

    it('keeps native Type rows once and appends one provider contribution without source-path attachment', () => {
        const nativeRows = [
            {
                providerId: 'tps/entity-types',
                id: 'task:first',
                kind: 'tps/entity-type/task',
                label: 'First task',
                sourcePath: 'Notes/shared.md'
            },
            {
                providerId: 'tps/entity-types',
                id: 'task:second',
                kind: 'tps/entity-type/task',
                label: 'Second task',
                sourcePath: 'Notes/shared.md'
            }
        ];
        const providerRows = [
            {
                providerId: 'example/related',
                id: 'shared:related',
                kind: 'example/related',
                label: 'Related record',
                sourcePath: 'Notes/shared.md'
            }
        ];

        const items = buildStandaloneProviderListItems([...nativeRows, ...providerRows]);

        expect(items.map(item => item.key)).toEqual([
            'top-spacer',
            'provider:tps/entity-types:task:first',
            'provider:tps/entity-types:task:second',
            'provider:example/related:shared:related',
            'bottom-spacer'
        ]);
    });
});
