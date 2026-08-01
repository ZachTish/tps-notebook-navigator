import { describe, expect, it } from 'vitest';
import { buildStandaloneProviderListItems } from '../../src/services/rows/providerListItems';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, type NavigatorProvidedRow } from '../../src/services/rows/types';
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

    it('keeps the owning Type row when an augmenting provider repeats the same public row identity', () => {
        const ownerRow = {
            providerId: 'example/shared',
            id: 'project:one',
            kind: 'example/project',
            label: 'Owner row',
            sourcePath: 'Projects/One.md'
        };
        const duplicateAugmentation = { ...ownerRow, label: 'Duplicate augmentation' };

        const items = buildStandaloneProviderListItems([ownerRow, duplicateAugmentation]);

        expect(items.map(item => item.key)).toEqual(['top-spacer', 'provider:example/shared:project:one', 'bottom-spacer']);
        expect(items[1].data).toBe(ownerRow);
    });

    it('keeps the owner-first 1,000-row budget when 1,000 augmenting rows are also available', () => {
        const ownerRows: NavigatorProvidedRow[] = Array.from({ length: NAVIGATOR_ROW_PROVIDER_MAX_ROWS }, (_, index) => ({
            providerId: 'example/owner',
            id: `owner:${index}`,
            kind: 'example/owner',
            label: `Owner ${index}`,
            sourcePath: `Projects/${index}.md`
        }));
        const augmentingRows: NavigatorProvidedRow[] = Array.from({ length: NAVIGATOR_ROW_PROVIDER_MAX_ROWS }, (_, index) => ({
            providerId: 'example/augmenting',
            id: `augmentation:${index}`,
            kind: 'example/augmentation',
            label: `Augmentation ${index}`,
            sourcePath: `Projects/${index}.md`
        }));

        const items = buildStandaloneProviderListItems([...ownerRows, ...augmentingRows]);
        const renderedRows = items.filter(item => item.type === ListPaneItemType.PROVIDER_ROW);

        expect(renderedRows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(renderedRows.map(item => item.data)).toEqual(ownerRows);
        expect(items).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS + 2);
    });
});
