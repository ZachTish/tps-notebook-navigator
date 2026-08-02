import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    applyNavigatorListPresentationPlan,
    createNavigatorListPresentationPlan,
    persistNavigatorListPresentationPlan,
    persistNavigatorListPresentationUpdate,
    resolveNavigatorListPresentationTarget
} from '../../src/services/listViewState/listPresentation';
import { ItemType } from '../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

function settings() {
    const value = structuredClone(DEFAULT_SETTINGS);
    value.propertySortKey = 'Priority, Status, Rank';
    value.manualSortPropertyKey = 'Rank';
    return value;
}

describe('public list presentation plans', () => {
    it('applies sort, grouping, and display atomically while preserving unrelated appearance fields', () => {
        const current = settings();
        current.folderAppearances.Projects = { titleRows: 3 };
        const target = { type: ItemType.FOLDER, key: 'Projects' } as const;
        const plan = createNavigatorListPresentationPlan(current, target, {
            sort: { option: 'property-desc', propertyKey: 'priority' },
            groupBy: 'property:status',
            displayMode: 'compact'
        });

        expect(plan).not.toBeNull();
        applyNavigatorListPresentationPlan(current, plan!);
        expect(current.folderSortOverrides.Projects).toEqual({ option: 'property-desc', propertyKey: 'Priority' });
        expect(current.folderAppearances.Projects).toEqual({
            titleRows: 3,
            groupBy: 'property:Status',
            mode: 'compact'
        });
    });

    it('accepts fixed Type targets while limiting line-backed Types to compatible sort/group fields', () => {
        const current = settings();
        expect(
            resolveNavigatorListPresentationTarget({
                selectionType: ItemType.TYPE,
                selectedFolder: null,
                selectedTag: null,
                selectedProperty: null,
                selectedType: TPS_NAVIGATOR_TYPE_IDS.NOTES
            })
        ).toEqual({ type: ItemType.TYPE, key: TPS_NAVIGATOR_TYPE_IDS.NOTES });
        expect(
            resolveNavigatorListPresentationTarget({
                selectionType: ItemType.TYPE,
                selectedFolder: null,
                selectedTag: null,
                selectedProperty: null,
                selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            })
        ).toEqual({ type: ItemType.TYPE, key: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES });

        const fileType = { type: ItemType.TYPE, key: TPS_NAVIGATOR_TYPE_IDS.NOTES } as const;
        const typePlan = createNavigatorListPresentationPlan(current, fileType, {
            sort: { option: 'property-desc', propertyKey: 'priority' },
            groupBy: 'property:status',
            displayMode: 'compact'
        });
        expect(typePlan).not.toBeNull();
        applyNavigatorListPresentationPlan(current, typePlan!);
        expect(current.typeSortOverrides?.[TPS_NAVIGATOR_TYPE_IDS.NOTES]).toEqual({
            option: 'property-desc',
            propertyKey: 'Priority'
        });
        expect(current.typeAppearances?.[TPS_NAVIGATOR_TYPE_IDS.NOTES]).toEqual({
            groupBy: 'property:Status',
            mode: 'compact'
        });

        const lineType = { type: ItemType.TYPE, key: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES } as const;
        const linePlan = createNavigatorListPresentationPlan(current, lineType, {
            sort: { option: 'title-desc' },
            groupBy: 'property:status'
        });
        expect(linePlan).not.toBeNull();
        applyNavigatorListPresentationPlan(current, linePlan!);
        expect(current.typeSortOverrides?.[TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]).toBe('title-desc');
        expect(current.typeAppearances?.[TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]).toEqual({ groupBy: 'property:Status' });
        expect(createNavigatorListPresentationPlan(current, lineType, { displayMode: 'compact' })).toBeNull();
        expect(createNavigatorListPresentationPlan(current, lineType, { groupBy: 'folder' })).toBeNull();
        expect(createNavigatorListPresentationPlan(current, lineType, { groupBy: 'custom' })).not.toBeNull();
        expect(
            createNavigatorListPresentationPlan(current, lineType, {
                sort: { option: 'property-asc', propertyKey: 'Rank' }
            })
        ).toBeNull();

        current.defaultFolderSort = 'property-asc';
        current.propertySortKey = 'Rank, Priority';
        expect(createNavigatorListPresentationPlan(current, lineType, { groupBy: 'property:priority' })).not.toBeNull();

        const tag = { type: ItemType.TAG, key: 'work' } as const;
        expect(createNavigatorListPresentationPlan(current, tag, { groupBy: 'folder' })).toBeNull();
        expect(createNavigatorListPresentationPlan(current, tag, { groupBy: 'date', sort: { option: 'title-asc' } })).toBeNull();
        expect(createNavigatorListPresentationPlan(current, tag, { sort: { option: 'property-asc', propertyKey: 'Rank' } })).toBeNull();

        current.tagSortOverrides.work = { option: 'property-asc', propertyKey: 'Rank' };
        expect(createNavigatorListPresentationPlan(current, tag, { displayMode: 'compact' })).toBeNull();
    });

    it('resets individual fields to inherited defaults without disturbing other fields', () => {
        const current = settings();
        current.tagSortOverrides.work = 'title-desc';
        current.tagAppearances.work = { mode: 'compact', groupBy: 'property:Status', previewRows: 2 };
        const target = { type: ItemType.TAG, key: 'work' } as const;
        const plan = createNavigatorListPresentationPlan(current, target, { sort: null, groupBy: null, displayMode: null });

        expect(plan?.changed).toBe(true);
        applyNavigatorListPresentationPlan(current, plan!);
        expect(current.tagSortOverrides.work).toBeUndefined();
        expect(current.tagAppearances.work).toEqual({ previewRows: 2 });
    });

    it('does not mutate settings when any requested field is invalid', () => {
        const current = settings();
        const before = structuredClone(current);
        const target = { type: ItemType.PROPERTY, key: 'key:status' } as const;

        expect(
            createNavigatorListPresentationPlan(current, target, {
                displayMode: 'compact',
                sort: { option: 'property-asc', propertyKey: 'Missing' }
            })
        ).toBeNull();
        expect(current).toEqual(before);
    });

    it('restores the affected live scope when persistence rejects', async () => {
        const current = settings();
        current.folderSortOverrides.Projects = 'title-desc';
        current.folderAppearances.Projects = { titleRows: 2, mode: 'standard' };
        const target = { type: ItemType.FOLDER, key: 'Projects' } as const;
        const plan = createNavigatorListPresentationPlan(current, target, {
            sort: { option: 'property-desc', propertyKey: 'Priority' },
            groupBy: 'property:Status',
            displayMode: 'compact'
        });
        const failure = new Error('save failed');
        let rollbackNotified = false;

        await expect(
            persistNavigatorListPresentationPlan({
                settings: current,
                plan: plan!,
                persist: async () => {
                    expect(current.folderSortOverrides.Projects).toEqual({
                        option: 'property-desc',
                        propertyKey: 'Priority'
                    });
                    current.folderAppearances.Other = { previewRows: 3 };
                    throw failure;
                },
                onRollback: () => {
                    rollbackNotified = true;
                }
            })
        ).rejects.toBe(failure);

        expect(current.folderSortOverrides.Projects).toBe('title-desc');
        expect(current.folderAppearances.Projects).toEqual({ titleRows: 2, mode: 'standard' });
        expect(current.folderAppearances.Other).toEqual({ previewRows: 3 });
        expect(rollbackNotified).toBe(true);
    });

    it('does not let an older failed save clobber a newer successful update in the same scope', async () => {
        const current = settings();
        const target = { type: ItemType.FOLDER, key: 'Projects' } as const;
        let rejectFirst: (reason: Error) => void = () => undefined;
        let markFirstStarted: () => void = () => undefined;
        const firstStarted = new Promise<void>(resolve => {
            markFirstStarted = resolve;
        });
        const failure = new Error('older save failed');

        const first = persistNavigatorListPresentationUpdate({
            settings: current,
            target,
            update: { sort: { option: 'title-desc' } },
            persist: () => {
                markFirstStarted();
                return new Promise<void>((_resolve, reject) => {
                    rejectFirst = reject;
                });
            }
        });
        const firstRejected = expect(first).rejects.toBe(failure);
        await firstStarted;

        const secondPersist = vi.fn(async () => undefined);
        const second = persistNavigatorListPresentationUpdate({
            settings: current,
            target,
            update: { sort: { option: 'created-desc' } },
            persist: secondPersist
        });
        await Promise.resolve();
        expect(secondPersist).not.toHaveBeenCalled();

        rejectFirst(failure);
        await firstRejected;
        await expect(second).resolves.toBe(true);

        expect(secondPersist).toHaveBeenCalledOnce();
        expect(current.folderSortOverrides.Projects).toBe('created-desc');
    });
});
