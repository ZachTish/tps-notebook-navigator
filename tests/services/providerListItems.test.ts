import { describe, expect, it } from 'vitest';
import { createTestTFile } from '../utils/createTestTFile';
import { ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { mergeProviderRowsIntoList } from '../../src/services/rows/providerListItems';
import { buildFilePathToIndexMap, buildOrderedFiles } from '../../src/hooks/listPaneData/listItems';

describe('mergeProviderRowsIntoList', () => {
    it('places transient rows directly below their source file, preserves source-local order, and drops orphans', () => {
        const one = createTestTFile('Notes/one.md');
        const two = createTestTFile('Notes/two.md');
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.FILE, data: one, key: 'file-one' },
            { type: ListPaneItemType.FILE, data: two, key: 'file-two' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const merged = mergeProviderRowsIntoList(listItems, [
            {
                providerId: 'tps/example',
                id: 'two-a',
                kind: 'tps/example-row',
                label: 'Two A',
                sourcePath: 'Notes/two.md'
            },
            {
                providerId: 'tps/example',
                id: 'one-a',
                kind: 'tps/example-row',
                label: 'One A',
                sourcePath: 'Notes/one.md'
            },
            {
                providerId: 'tps/example',
                id: 'orphan',
                kind: 'tps/example-row',
                label: 'Orphan',
                sourcePath: 'Notes/missing.md'
            },
            {
                providerId: 'tps/example',
                id: 'one-b',
                kind: 'tps/example-row',
                label: 'One B',
                sourcePath: 'Notes/one.md'
            }
        ]);

        expect(merged.map(item => item.type)).toEqual([
            ListPaneItemType.FILE,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.FILE,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(merged.map(item => item.key)).toEqual([
            'file-one',
            'provider:tps/example:one-a',
            'provider:tps/example:one-b',
            'file-two',
            'provider:tps/example:two-a',
            'bottom'
        ]);

        expect(buildOrderedFiles(merged).orderedFiles).toEqual([one, two]);
        expect(Array.from(buildFilePathToIndexMap(merged).entries())).toEqual([
            ['Notes/one.md', 0],
            ['Notes/two.md', 3]
        ]);
    });

    it('returns the original list identity when there are no provider rows', () => {
        const listItems: ListPaneItem[] = [{ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }];
        expect(mergeProviderRowsIntoList(listItems, [])).toBe(listItems);
    });

    it('groups property-bearing task rows by their own tags instead of their source note group', () => {
        const daily = createTestTFile('Daily.md');
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
            { type: ListPaneItemType.HEADER, data: 'dailynote', key: 'daily-header', headerKind: 'property' },
            { type: ListPaneItemType.FILE, data: daily, key: 'daily-file' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const rows = [
            {
                providerId: 'tps/gcm-tasks',
                id: 'untagged',
                kind: 'tps/gcm-task',
                label: 'Untagged task',
                sourcePath: daily.path,
                properties: { tags: [] }
            },
            {
                providerId: 'tps/gcm-tasks',
                id: 'career',
                kind: 'tps/gcm-task',
                label: 'Career task',
                sourcePath: daily.path,
                properties: { tags: ['career'] }
            }
        ];

        const merged = mergeProviderRowsIntoList(listItems, rows, {
            propertyKey: 'tags',
            noValueLabel: 'None',
            noValuePosition: 'bottom'
        });

        const groupByRow = new Map<string, string>();
        let group = '';
        merged.forEach(item => {
            if (item.type === ListPaneItemType.HEADER) group = typeof item.data === 'string' ? item.data : '';
            if (item.type === ListPaneItemType.PROVIDER_ROW) groupByRow.set(String((item.data as { id: string }).id), group);
        });
        expect(groupByRow).toEqual(
            new Map([
                ['career', 'career'],
                ['untagged', 'None']
            ])
        );
        expect(groupByRow.has('dailynote')).toBe(false);
    });
});
