import { describe, expect, it } from 'vitest';
import {
    buildNavigationTypeItems,
    buildNavigationTypeReorderItems,
    expandTypeSelectionAncestors,
    getTypeSelectionAncestorIds
} from '../../src/hooks/navigationPane/data/useNavigationPaneTypeSection';
import { TYPES_KINDS_VIRTUAL_FOLDER_ID, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import {
    createTpsNavigatorKindTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';

const projectTypeId = createTpsNavigatorKindTypeId('project')!;

function createSnapshot(descriptors: readonly TpsNavigatorTypeDescriptor[]): TpsNavigatorTypesSnapshot {
    return {
        availability: 'ready',
        descriptors,
        recordsByType: new Map(),
        revision: 1
    };
}

const structuralDescriptor: TpsNavigatorTypeDescriptor = {
    id: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
    label: 'Checkboxes',
    icon: 'lucide-square-check-big',
    category: 'structure',
    count: 12
};

const kindDescriptor: TpsNavigatorTypeDescriptor = {
    id: projectTypeId,
    label: 'Project',
    icon: 'lucide-box',
    category: 'kind',
    count: 3
};

describe('buildNavigationTypeItems', () => {
    it('returns only the collapsed Types root and advertises its children', () => {
        const items = buildNavigationTypeItems(createSnapshot([structuralDescriptor, kindDescriptor]), new Set());

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            key: TYPES_ROOT_VIRTUAL_FOLDER_ID,
            level: 0,
            isSelectable: true,
            hasChildren: true,
            data: {
                id: TYPES_ROOT_VIRTUAL_FOLDER_ID,
                name: 'Types',
                icon: 'lucide-shapes'
            }
        });
    });

    it('shows structural leaves and the collapsed Kinds group when only Types is expanded', () => {
        const items = buildNavigationTypeItems(
            createSnapshot([structuralDescriptor, kindDescriptor]),
            new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID])
        );

        expect(items.map(item => item.key)).toEqual([
            TYPES_ROOT_VIRTUAL_FOLDER_ID,
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            TYPES_KINDS_VIRTUAL_FOLDER_ID
        ]);
        expect(items[1]).toMatchObject({
            level: 1,
            typeCollectionId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            isSelectable: true,
            hasChildren: false,
            showFileCount: true,
            noteCount: { current: 12, descendants: 0, total: 12 }
        });
        expect(items[2]).toMatchObject({
            level: 1,
            key: TYPES_KINDS_VIRTUAL_FOLDER_ID,
            isSelectable: true,
            hasChildren: true,
            data: { name: 'Kinds', icon: 'lucide-boxes' }
        });
    });

    it('identifies and expands the virtual ancestors required to reveal restored selections', () => {
        expect(getTypeSelectionAncestorIds(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID]);
        expect(getTypeSelectionAncestorIds(projectTypeId)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID]);

        const structuralExpansion = expandTypeSelectionAncestors(new Set(), TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(structuralExpansion).toEqual(new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID]));

        const kindExpansion = expandTypeSelectionAncestors(new Set(['unrelated']), projectTypeId);
        expect(kindExpansion).toEqual(new Set(['unrelated', TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID]));
        expect(expandTypeSelectionAncestors(kindExpansion, projectTypeId)).toBe(kindExpansion);
    });

    it('builds a fully expanded, rootless preview for root-section reorder mode', () => {
        const items = buildNavigationTypeReorderItems(createSnapshot([structuralDescriptor, kindDescriptor]));

        expect(items.map(item => item.key)).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TYPES_KINDS_VIRTUAL_FOLDER_ID, projectTypeId]);
        expect(items[0]).toMatchObject({ level: 1 });
        expect(items[1]).toMatchObject({ level: 1 });
        expect(items[2]).toMatchObject({ level: 2 });
    });

    it('shows kind leaves at level two with descriptor identity and counts when both groups are expanded', () => {
        const items = buildNavigationTypeItems(
            createSnapshot([structuralDescriptor, kindDescriptor]),
            new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID])
        );

        expect(items.map(item => item.key)).toEqual([
            TYPES_ROOT_VIRTUAL_FOLDER_ID,
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            TYPES_KINDS_VIRTUAL_FOLDER_ID,
            projectTypeId
        ]);
        expect(items[3]).toMatchObject({
            level: 2,
            key: projectTypeId,
            typeCollectionId: projectTypeId,
            isSelectable: true,
            hasChildren: false,
            showFileCount: true,
            noteCount: { current: 3, descendants: 0, total: 3 },
            data: {
                id: `tps-type:${projectTypeId}`,
                name: 'Project',
                icon: 'lucide-box'
            }
        });
    });

    it('omits the Kinds group when no kind descriptors exist and marks an empty root as childless', () => {
        const structuralItems = buildNavigationTypeItems(
            createSnapshot([structuralDescriptor]),
            new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID, TYPES_KINDS_VIRTUAL_FOLDER_ID])
        );
        const emptyItems = buildNavigationTypeItems(createSnapshot([]), new Set());

        expect(structuralItems.map(item => item.key)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
        expect(emptyItems).toHaveLength(1);
        expect(emptyItems[0].hasChildren).toBe(false);
    });
});
