import { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { buildStandaloneStructuralTypePresentation } from '../../../src/hooks/listPaneData/standaloneTypePresentation';
import type { NavigatorProvidedRow } from '../../../src/services/rows/types';
import { ListPaneItemType } from '../../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../../src/types/navigatorTypes';
import type { ListPaneItem } from '../../../src/types/virtualization';
import { buildListGroupCollapseKey } from '../../../src/utils/listGroupCollapse';
import { ItemType } from '../../../src/types';
import { createTestTFile } from '../../utils/createTestTFile';

interface FixtureFile {
    file: TFile;
    frontmatter: unknown;
}

function file(path: string, created: number, modified: number, frontmatter: unknown = {}): FixtureFile {
    const result = createTestTFile(path);
    Reflect.set(result, 'stat', { ctime: created, mtime: modified, size: 0 });
    return { file: result, frontmatter };
}

function row(id: string, label: string, sourcePath: string, sourceLineNumber?: number): NavigatorProvidedRow {
    return {
        providerId: 'tps/entity-types',
        id,
        kind: 'tps/entity-type/task',
        label,
        sourcePath,
        ...(sourceLineNumber === undefined ? {} : { sourceLineNumber })
    };
}

function rowsFrom(items: readonly ListPaneItem[]): NavigatorProvidedRow[] {
    return items.flatMap(item =>
        item.type === ListPaneItemType.PROVIDER_ROW && typeof item.data === 'object' ? [item.data as NavigatorProvidedRow] : []
    );
}

function headersFrom(items: readonly ListPaneItem[]): ListPaneItem[] {
    return items.filter(item => item.type === ListPaneItemType.HEADER);
}

function present({
    rows,
    files,
    option = 'title-asc',
    propertyKey = '',
    propertySortSecondary = 'title',
    groupBy = 'custom',
    collapsedListGroups
}: {
    rows: readonly NavigatorProvidedRow[];
    files: readonly FixtureFile[];
    option?:
        | 'modified-desc'
        | 'modified-asc'
        | 'created-desc'
        | 'created-asc'
        | 'title-asc'
        | 'title-desc'
        | 'filename-asc'
        | 'filename-desc'
        | 'property-asc'
        | 'property-desc';
    propertyKey?: string;
    propertySortSecondary?: 'title' | 'filename' | 'created' | 'modified';
    groupBy?: 'custom' | 'date' | `property:${string}` | `property-desc:${string}`;
    collapsedListGroups?: ReadonlySet<string>;
}): ListPaneItem[] {
    const sourceByPath = new Map(files.map(entry => [entry.file.path, entry]));
    return buildStandaloneStructuralTypePresentation({
        rows,
        selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
        sort: { option, propertyKey, propertySortSecondary },
        groupBy,
        dayKey: '2026-08-02',
        collapsedListGroups,
        resolveFile: path => sourceByPath.get(path)?.file ?? null,
        getFrontmatter: target => sourceByPath.get(target.path)?.frontmatter ?? null,
        getFileTimestamps: target => ({ created: target.stat.ctime, modified: target.stat.mtime }),
        noValueLabel: 'No value'
    });
}

describe('standalone structural Type presentation', () => {
    it('sorts Title by row label and resolves equal labels by source path, line, and id', () => {
        const files = [file('Zeta.md', 1, 1), file('Alpha.md', 1, 1)];
        const input = [
            row('z', 'Same', 'Zeta.md', 8),
            row('b', 'Same', 'Alpha.md', 8),
            row('a', 'Same', 'Alpha.md', 8),
            row('line', 'Same', 'Alpha.md', 2),
            row('first', 'Alpha row', 'Zeta.md', 3)
        ];

        expect(rowsFrom(present({ rows: input, files })).map(item => item.id)).toEqual(['first', 'line', 'a', 'b', 'z']);
        expect(rowsFrom(present({ rows: input, files, option: 'title-desc' })).map(item => item.id)).toEqual([
            'line',
            'a',
            'b',
            'z',
            'first'
        ]);
    });

    it('sorts filename and file timestamps from the owning TFile while keeping unresolved sources last', () => {
        const files = [file('Zeta.md', 10, 40), file('Alpha.md', 30, 20)];
        const input = [row('missing', 'Missing', 'Gone.md', 1), row('zeta', 'Zeta', 'Zeta.md', 1), row('alpha', 'Alpha', 'Alpha.md', 1)];

        expect(rowsFrom(present({ rows: input, files, option: 'filename-asc' })).map(item => item.id)).toEqual([
            'alpha',
            'zeta',
            'missing'
        ]);
        expect(rowsFrom(present({ rows: input, files, option: 'created-desc' })).map(item => item.id)).toEqual([
            'alpha',
            'zeta',
            'missing'
        ]);
        expect(rowsFrom(present({ rows: input, files, option: 'modified-desc' })).map(item => item.id)).toEqual([
            'zeta',
            'alpha',
            'missing'
        ]);
    });

    it('sorts by owning-note properties, applies the configured secondary, and leaves missing values last in both directions', () => {
        const files = [
            file('A.md', 1, 1, { priority: 'medium' }),
            file('B.md', 1, 1, { priority: 'high' }),
            file('C.md', 1, 1, {}),
            file('D.md', 1, 1, { priority: 'high' })
        ];
        const input = [
            row('c', 'Absent', 'C.md', 1),
            row('d', 'Zulu', 'D.md', 1),
            row('a', 'Medium', 'A.md', 1),
            row('b', 'Alpha', 'B.md', 1)
        ];

        expect(rowsFrom(present({ rows: input, files, option: 'property-asc', propertyKey: 'Priority' })).map(item => item.id)).toEqual([
            'b',
            'd',
            'a',
            'c'
        ]);
        expect(rowsFrom(present({ rows: input, files, option: 'property-desc', propertyKey: 'Priority' })).map(item => item.id)).toEqual([
            'a',
            'd',
            'b',
            'c'
        ]);
    });

    it('groups property values in deterministic direction, counts rows, trails missing values, and honors collapse state', () => {
        const files = [file('Numeric.md', 1, 1, { lane: 2 }), file('Alpha.md', 1, 1, { lane: 'Alpha' }), file('Missing.md', 1, 1, {})];
        const input = [
            row('numeric', 'Numeric', 'Numeric.md', 1),
            row('alpha-2', 'Alpha 2', 'Alpha.md', 2),
            row('missing', 'Missing', 'Missing.md', 1),
            row('alpha-1', 'Alpha 1', 'Alpha.md', 1)
        ];
        const ascending = present({ rows: input, files, groupBy: 'property:lane' });

        expect(headersFrom(ascending).map(header => header.data)).toEqual(['2', 'Alpha', 'No value']);
        expect(headersFrom(ascending).map(header => header.groupFilePaths?.length)).toEqual([1, 2, 1]);
        expect(rowsFrom(ascending).map(item => item.id)).toEqual(['numeric', 'alpha-1', 'alpha-2', 'missing']);
        expect(headersFrom(present({ rows: input, files, groupBy: 'property-desc:lane' })).map(header => header.data)).toEqual([
            'Alpha',
            '2',
            'No value'
        ]);

        const alphaCollapseKey = buildListGroupCollapseKey({
            selectionType: ItemType.TYPE,
            selectedFolderPath: null,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            groupingMode: 'property:lane',
            groupId: 'property-value:Alpha'
        });
        const collapsed = present({ rows: input, files, groupBy: 'property:lane', collapsedListGroups: new Set([alphaCollapseKey]) });
        const alphaHeader = headersFrom(collapsed).find(header => header.data === 'Alpha');

        expect(alphaHeader).toMatchObject({ collapseKey: alphaCollapseKey, isCollapsed: true, headerKind: 'property' });
        expect(rowsFrom(collapsed).map(item => item.id)).toEqual(['numeric', 'missing']);
    });

    it('groups date-sorted rows by the owning file timestamp with missing timestamps last and collapsible row counts', () => {
        const today = new Date(2026, 7, 2, 12).getTime();
        const yesterday = new Date(2026, 7, 1, 12).getTime();
        const files = [file('Today.md', today, today), file('Yesterday.md', yesterday, yesterday)];
        const input = [
            row('missing', 'Missing', 'Missing.md', 1),
            row('yesterday', 'Yesterday', 'Yesterday.md', 1),
            row('today-2', 'Today 2', 'Today.md', 2),
            row('today-1', 'Today 1', 'Today.md', 1)
        ];
        const uncollapsed = present({ rows: input, files, option: 'modified-desc', groupBy: 'date' });
        const headers = headersFrom(uncollapsed);

        expect(headers.map(header => header.key)).toEqual([
            'standalone-type-header:date:modified:relative:today',
            'standalone-type-header:date:modified:relative:yesterday',
            'standalone-type-header:date:modified:none'
        ]);
        expect(headers.map(header => header.groupFilePaths?.length)).toEqual([2, 1, 1]);
        expect(rowsFrom(uncollapsed).map(item => item.id)).toEqual(['today-1', 'today-2', 'yesterday', 'missing']);

        const todayCollapseKey = headers[0].collapseKey!;
        const collapsed = present({
            rows: input,
            files,
            option: 'modified-desc',
            groupBy: 'date',
            collapsedListGroups: new Set([todayCollapseKey])
        });
        expect(headersFrom(collapsed)[0]).toMatchObject({ isCollapsed: true, headerKind: 'date' });
        expect(rowsFrom(collapsed).map(item => item.id)).toEqual(['yesterday', 'missing']);
    });

    it('does not mutate source rows, resolves each source once, and treats unsupported grouping as an ungrouped list', () => {
        const files = [file('Source.md', 1, 1, { lane: 'Alpha' })];
        const input = Object.freeze([row('two', 'Two', 'Source.md', 2), row('one', 'One', 'Source.md', 1)]);
        const resolveFile = vi.fn((path: string) => files.find(entry => entry.file.path === path)?.file ?? null);
        const getFrontmatter = vi.fn((target: TFile) => files.find(entry => entry.file === target)?.frontmatter ?? null);
        const result = buildStandaloneStructuralTypePresentation({
            rows: input,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            sort: { option: 'title-asc', propertyKey: '', propertySortSecondary: 'title' },
            groupBy: 'folder',
            dayKey: '2026-08-02',
            resolveFile,
            getFrontmatter,
            getFileTimestamps: target => ({ created: target.stat.ctime, modified: target.stat.mtime }),
            noValueLabel: 'No value'
        });

        expect(rowsFrom(result).map(item => item.id)).toEqual(['one', 'two']);
        expect(headersFrom(result)).toEqual([]);
        expect(input.map(item => item.id)).toEqual(['two', 'one']);
        expect(resolveFile).toHaveBeenCalledOnce();
        expect(getFrontmatter).toHaveBeenCalledOnce();
    });
});
