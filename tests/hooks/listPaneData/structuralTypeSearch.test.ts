import { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
    fileMatchesStructuralTypeSearch,
    getStructuralTypeSearchCollections,
    getStructuralTypeSourceSearchTokens,
    isMixedStructuralSearchActive,
    shouldUseGlobalTypeSearch
} from '../../../src/hooks/listPaneData/structuralTypeSearch';
import { filterListPaneFiles } from '../../../src/hooks/listPaneData/searchPipeline';
import { buildTypeProviderRows } from '../../../src/services/rows/typeProviderRows';
import type { IndexedDBStorage } from '../../../src/storage/IndexedDBStorage';
import { createTpsNavigatorProviderTypeId } from '../../../src/types/navigatorTypes';
import { TPS_NAVIGATOR_LINE_TYPES, TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypesSnapshot } from '../../../src/types/navigatorTypes';
import {
    filterSearchHasActiveCriteria,
    parseFilterSearchTokens,
    updateFilterQueryWithTag,
    updateFilterQueryWithType
} from '../../../src/utils/filterSearch';
import { createTestTFile } from '../../utils/createTestTFile';

describe('structural Type search helpers', () => {
    it('separates row-name and Type facets from owning-note metadata filters', () => {
        const tokens = parseFilterSearchTokens('milk -archived #shopping .status=open folder:areas type:structural:task');
        const sourceTokens = getStructuralTypeSourceSearchTokens(tokens);

        expect(sourceTokens.nameTokens).toEqual([]);
        expect(sourceTokens.excludeNameTokens).toEqual([]);
        expect(sourceTokens.typeTokens).toEqual([]);
        expect(sourceTokens.tagTokens).toEqual(['shopping']);
        expect(sourceTokens.propertyTokens).toEqual([{ key: 'status', value: 'open' }]);
        expect(sourceTokens.folderTokens).toEqual([{ mode: 'segment', value: 'areas' }]);
        expect(filterSearchHasActiveCriteria(sourceTokens)).toBe(true);
    });

    it('makes a name-and-Type-only query inactive for owning-note metadata filtering', () => {
        const sourceTokens = getStructuralTypeSourceSearchTokens(parseFilterSearchTokens('milk type:structural:task'));

        expect(filterSearchHasActiveCriteria(sourceTokens)).toBe(false);
    });

    it('filters native files by file-backed facets while line-backed facets render separately', () => {
        const app = new App();
        const note = createTestTFile('Notes/Today.md');
        const pdf = createTestTFile('Files/Guide.pdf');

        expect(fileMatchesStructuralTypeSearch(app, note, parseFilterSearchTokens('type:entity:note'))).toBe(true);
        expect(fileMatchesStructuralTypeSearch(app, pdf, parseFilterSearchTokens('type:entity:note'))).toBe(false);
        expect(fileMatchesStructuralTypeSearch(app, note, parseFilterSearchTokens('type:structural:task'))).toBe(false);
        expect(fileMatchesStructuralTypeSearch(app, pdf, parseFilterSearchTokens('type:entity:note type:file:pdf'))).toBe(true);
        expect(fileMatchesStructuralTypeSearch(app, note, parseFilterSearchTokens('-type:entity:note'))).toBe(false);
    });

    it('returns every built-in line Type by default and applies positive union plus exclusions', () => {
        expect(getStructuralTypeSearchCollections(parseFilterSearchTokens('milk'))).toEqual(TPS_NAVIGATOR_LINE_TYPES.map(type => type.id));
        expect(
            getStructuralTypeSearchCollections(
                parseFilterSearchTokens('type:structural:task type:structural:heading -type:structural:task')
            )
        ).toEqual([TPS_NAVIGATOR_TYPE_IDS.HEADINGS]);
        expect(getStructuralTypeSearchCollections(parseFilterSearchTokens('type:file:pdf'))).toEqual([]);
    });

    it('keeps ordinary searches scoped to the selected Type and expands only explicit Type-facet searches', () => {
        const base = { enabled: true, isTypeSelection: true, hasSearchQuery: true, useOmnisearch: false, hasExplicitTypeFacets: false };

        expect(shouldUseGlobalTypeSearch({ ...base, selectedType: TPS_NAVIGATOR_TYPE_IDS.NOTES })).toBe(false);
        expect(shouldUseGlobalTypeSearch({ ...base, selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES })).toBe(false);
        expect(shouldUseGlobalTypeSearch({ ...base, selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, hasExplicitTypeFacets: true })).toBe(
            true
        );
        expect(shouldUseGlobalTypeSearch({ ...base, hasSearchQuery: false, selectedType: TPS_NAVIGATOR_TYPE_IDS.NOTES })).toBe(false);
        expect(shouldUseGlobalTypeSearch({ ...base, useOmnisearch: true, selectedType: TPS_NAVIGATOR_TYPE_IDS.NOTES })).toBe(false);
        expect(
            shouldUseGlobalTypeSearch({
                ...base,
                selectedType: createTpsNavigatorProviderTypeId('example/entities', 'projects')
            })
        ).toBe(false);
    });

    it('reports mixed structural search only for the same eligible internal-search scopes that render structural groups', () => {
        const base = {
            enabled: true,
            isTypeSelection: false,
            useGlobalTypeSearch: false,
            useOmnisearch: false,
            hasSearchQuery: true,
            hasParsedSearchTokens: true
        };

        expect(isMixedStructuralSearchActive(base)).toBe(true);
        expect(isMixedStructuralSearchActive({ ...base, isTypeSelection: true, useGlobalTypeSearch: true })).toBe(true);
        expect(isMixedStructuralSearchActive({ ...base, isTypeSelection: true })).toBe(false);
        expect(isMixedStructuralSearchActive({ ...base, useOmnisearch: true })).toBe(false);
        expect(isMixedStructuralSearchActive({ ...base, hasSearchQuery: false })).toBe(false);
        expect(isMixedStructuralSearchActive({ ...base, hasParsedSearchTokens: false })).toBe(false);
        expect(isMixedStructuralSearchActive({ ...base, enabled: false })).toBe(false);
    });

    it('keeps a normally selected tag as scope while Shift-adding Checkboxes and another tag', () => {
        const app = new App();
        const shoppingAndErrands = createTestTFile('Notes/Store.md');
        const shoppingOnly = createTestTFile('Notes/Wishlist.md');
        const selectedShoppingScope = [shoppingAndErrands, shoppingOnly];
        const tagsByPath = new Map([
            [shoppingAndErrands.path, ['shopping', 'errands']],
            [shoppingOnly.path, ['shopping']]
        ]);
        const db = {
            getFile: (path: string) => ({ tags: tagsByPath.get(path) ?? [] })
        } as unknown as IndexedDBStorage;

        const withCheckbox = updateFilterQueryWithType('', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES).query;
        const query = updateFilterQueryWithTag(withCheckbox, 'errands', 'AND').query;
        const tokens = parseFilterSearchTokens(query);
        const sourceTokens = getStructuralTypeSourceSearchTokens(tokens);
        const sourceFiles = filterListPaneFiles({
            app,
            baseFiles: selectedShoppingScope,
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchTokens: sourceTokens,
            searchableNames: new Map(),
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'title-asc',
            trimmedQuery: query,
            useOmnisearch: false
        }).files;

        const snapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            lineAvailability: 'ready',
            descriptors: [],
            recordsByType: new Map([
                [
                    TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                    [shoppingAndErrands, shoppingOnly].map((file, index) => ({
                        id: `task-${index}`,
                        typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                        label: `Task ${index + 1}`,
                        sourcePath: file.path,
                        entityType: 'block' as const,
                        lineKind: 'task' as const,
                        lineNumber: index + 1,
                        locatorKey: `locator-${index}`,
                        referenceTarget: file.path
                    }))
                ]
            ]),
            revision: 1
        };
        const rows = buildTypeProviderRows({
            snapshot,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            searchQuery: query,
            searchTokens: tokens,
            allowedSourcePaths: new Set(sourceFiles.map(file => file.path)),
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => false,
            onActivationFailure: () => undefined
        });

        expect(query).toBe(`type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES} #errands`);
        expect(sourceFiles).toEqual([shoppingAndErrands]);
        expect(rows.map(row => row.sourcePath)).toEqual([shoppingAndErrands.path]);
    });
});
