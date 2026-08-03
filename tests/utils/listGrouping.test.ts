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
import type { NotebookNavigatorSettings } from '../../src/settings';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    createPropertyGroupingOption,
    getPropertyGroupingDirection,
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    getPropertyGroupingSource,
    normalizeListNoteGroupingBaseOption,
    normalizeListNoteGroupingOption,
    normalizePropertyGroupingSourceForMenu,
    replacePropertyGroupingSource
} from '../../src/settings/types';
import { ItemType } from '../../src/types';
import { buildPropertyKeyNodeId } from '../../src/utils/propertyTree';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import {
    areListGroupingOptionsEqual,
    areListGroupingOptionsSameKind,
    hasEffectiveCustomListGrouping,
    pruneUnavailablePropertyGroupingOverrides,
    resolveEffectiveListGroupingForSort,
    resolveListGrouping,
    updatePropertyGroupingOverrideKeys
} from '../../src/utils/listGrouping';

type GroupingSettings = Pick<
    NotebookNavigatorSettings,
    'noteGrouping' | 'folderAppearances' | 'tagAppearances' | 'propertyAppearances' | 'typeAppearances'
>;

function createGroupingSettings(noteGrouping: GroupingSettings['noteGrouping']): GroupingSettings {
    return {
        noteGrouping,
        folderAppearances: {},
        tagAppearances: {},
        propertyAppearances: {},
        typeAppearances: {}
    };
}

describe('resolveListGrouping property selections', () => {
    it('uses custom property grouping overrides when present', () => {
        const propertyNodeId = buildPropertyKeyNodeId('status');
        const settings = createGroupingSettings('custom');
        settings.propertyAppearances = {
            [propertyNodeId]: { groupBy: 'date' }
        };

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId
        });

        expect(result.defaultGrouping).toBe('custom');
        expect(result.effectiveGrouping).toBe('date');
        expect(result.normalizedOverride).toBe('date');
        expect(result.hasCustomOverride).toBe(true);
    });

    it('normalizes invalid folder grouping overrides for properties', () => {
        const propertyNodeId = buildPropertyKeyNodeId('status');
        const settings = createGroupingSettings('folder');
        settings.propertyAppearances = {
            [propertyNodeId]: { groupBy: 'folder' }
        };

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId
        });

        expect(result.defaultGrouping).toBe('date');
        expect(result.effectiveGrouping).toBe('date');
        expect(result.normalizedOverride).toBeUndefined();
        expect(result.hasCustomOverride).toBe(false);
    });

    it('falls back to normalized default grouping when no property override exists', () => {
        const settings = createGroupingSettings('folder');

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId: buildPropertyKeyNodeId('status')
        });

        expect(result.defaultGrouping).toBe('date');
        expect(result.effectiveGrouping).toBe('date');
        expect(result.normalizedOverride).toBeUndefined();
        expect(result.hasCustomOverride).toBe(false);
    });
});

describe('resolveListGrouping structural Type selections', () => {
    it('uses a per-Type override and normalizes a folder default for vault-wide Types', () => {
        const settings = createGroupingSettings('folder');
        settings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.NOTES]: { groupBy: 'property:status' }
        };

        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TYPE,
                typeId: TPS_NAVIGATOR_TYPE_IDS.NOTES
            })
        ).toMatchObject({
            defaultGrouping: 'date',
            effectiveGrouping: 'property:status',
            hasCustomOverride: true
        });
        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TYPE,
                typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            })
        ).toMatchObject({
            defaultGrouping: 'date',
            effectiveGrouping: 'date',
            hasCustomOverride: false
        });
    });
});

describe('resolveEffectiveListGroupingForSort', () => {
    it('uses custom groups when property sort would otherwise use date grouping', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('custom');
    });

    it('keeps folder grouping for property-sorted folder views', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'folder',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('folder');
    });

    it('uses custom groups for property-sorted tag and property views', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.TAG
            })
        ).toBe('custom');
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.PROPERTY
            })
        ).toBe('custom');
    });

    it('uses custom groups when date grouping is paired with a non-date sort', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'title-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('custom');
    });

    it('keeps date grouping with date sorts', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'modified-desc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('date');
    });

    it('locks manual sort to custom groups', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'folder',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER,
                isManualSortActive: true
            })
        ).toBe('custom');
    });

    it('keeps property grouping under every sort and selection type', () => {
        const groupBy = createPropertyGroupingOption('status');
        (['modified-desc', 'title-asc', 'property-asc'] as const).forEach(sortOption => {
            expect(
                resolveEffectiveListGroupingForSort({
                    groupBy,
                    sortOption,
                    selectionType: ItemType.FOLDER
                })
            ).toBe(groupBy);
        });
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy,
                sortOption: 'property-asc',
                selectionType: ItemType.TAG
            })
        ).toBe(groupBy);
    });

    it('locks manual sort to custom groups even with property grouping', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: createPropertyGroupingOption('status'),
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER,
                isManualSortActive: true
            })
        ).toBe('custom');
    });
});

describe('property grouping option encoding', () => {
    it('extracts trimmed property keys from encoded options', () => {
        expect(getPropertyGroupingKey('property:status')).toBe('status');
        expect(getPropertyGroupingKey('property: status ')).toBe('status');
        expect(getPropertyGroupingKey('property-desc:status')).toBe('status');
        expect(getPropertyGroupingKey('property-day:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('property-day-desc:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('line-property:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('line-property-day-desc:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('property:')).toBeNull();
        expect(getPropertyGroupingKey('folder')).toBeNull();
    });

    it('extracts the group order direction from the prefix', () => {
        expect(getPropertyGroupingDirection('property:status')).toBe('asc');
        expect(getPropertyGroupingDirection('property-desc:status')).toBe('desc');
        expect(getPropertyGroupingDirection('property-day:scheduled')).toBe('asc');
        expect(getPropertyGroupingDirection('property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingDirection('line-property:scheduled')).toBe('asc');
        expect(getPropertyGroupingDirection('line-property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingDirection('folder')).toBeNull();
        expect(getPropertyGroupingGranularity('property:status')).toBe('value');
        expect(getPropertyGroupingGranularity('property-day:scheduled')).toBe('day');
        expect(getPropertyGroupingGranularity('line-property:scheduled')).toBe('value');
        expect(getPropertyGroupingGranularity('line-property-day:scheduled')).toBe('day');
        expect(getPropertyGroupingGranularity('folder')).toBeNull();
        expect(getPropertyGroupingSource('property:status')).toBe('note');
        expect(getPropertyGroupingSource('property-day:scheduled')).toBe('note');
        expect(getPropertyGroupingSource('line-property:status')).toBe('line');
        expect(getPropertyGroupingSource('line-property-day:scheduled')).toBe('line');
        expect(getPropertyGroupingSource('folder')).toBeNull();
        expect(createPropertyGroupingOption('status', 'desc')).toBe('property-desc:status');
        expect(createPropertyGroupingOption('status')).toBe('property:status');
        expect(createPropertyGroupingOption('scheduled', 'asc', 'day')).toBe('property-day:scheduled');
        expect(createPropertyGroupingOption('scheduled', 'desc', 'day')).toBe('property-day-desc:scheduled');
        expect(createPropertyGroupingOption('status', 'asc', 'value', 'line')).toBe('line-property:status');
        expect(createPropertyGroupingOption('scheduled', 'desc', 'day', 'line')).toBe('line-property-day-desc:scheduled');
    });

    it('keeps keys containing separator characters intact under both prefixes', () => {
        expect(getPropertyGroupingKey('property:-desc:odd')).toBe('-desc:odd');
        expect(getPropertyGroupingDirection('property:-desc:odd')).toBe('asc');
    });

    it('switches property sources without changing the key, direction, or day granularity', () => {
        expect(replacePropertyGroupingSource('property-day-desc:Scheduled', 'line')).toBe('line-property-day-desc:Scheduled');
        expect(replacePropertyGroupingSource('line-property:Parents', 'note')).toBe('property:Parents');
        expect(replacePropertyGroupingSource('date', 'line')).toBeNull();
    });

    it('normalizes line source for menu display only when line properties are unavailable', () => {
        const stored = 'line-property-day-desc:Scheduled' as const;
        expect(normalizePropertyGroupingSourceForMenu(stored, true)).toBe(stored);
        expect(normalizePropertyGroupingSourceForMenu(stored, false)).toBe('property-day-desc:Scheduled');
        expect(stored).toBe('line-property-day-desc:Scheduled');
        expect(normalizePropertyGroupingSourceForMenu('date', false)).toBe('date');
    });

    it('normalizes property grouping options to trimmed canonical form', () => {
        expect(normalizeListNoteGroupingOption('property: status ')).toBe('property:status');
        expect(normalizeListNoteGroupingOption('property-desc: status ')).toBe('property-desc:status');
        expect(normalizeListNoteGroupingOption('property-day: scheduled ')).toBe('property-day:scheduled');
        expect(normalizeListNoteGroupingOption('property-day-desc: scheduled ')).toBe('property-day-desc:scheduled');
        expect(normalizeListNoteGroupingOption('line-property: status ')).toBe('line-property:status');
        expect(normalizeListNoteGroupingOption('line-property-day-desc: scheduled ')).toBe('line-property-day-desc:scheduled');
        expect(normalizeListNoteGroupingOption('property:')).toBeNull();
        expect(normalizeListNoteGroupingOption('property-desc:')).toBeNull();
        expect(normalizeListNoteGroupingOption('none')).toBe('custom');
        expect(normalizeListNoteGroupingOption('date')).toBe('date');
    });

    it('rejects property encodings for the vault-wide default grouping', () => {
        expect(normalizeListNoteGroupingBaseOption('property:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('property-desc:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('line-property:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('none')).toBe('custom');
        expect(normalizeListNoteGroupingBaseOption('folder')).toBe('folder');
        expect(normalizeListNoteGroupingBaseOption('date')).toBe('date');
    });

    it('compares property grouping options case-insensitively including direction', () => {
        expect(areListGroupingOptionsEqual('property:Status', 'property:status')).toBe(true);
        expect(areListGroupingOptionsEqual('property:status', 'property-desc:status')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'property:genre')).toBe(false);
        expect(areListGroupingOptionsEqual('property:scheduled', 'property-day:scheduled')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'line-property:status')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'folder')).toBe(false);
        expect(areListGroupingOptionsEqual('date', 'date')).toBe(true);
    });

    it('matches grouping options of the same kind regardless of direction', () => {
        expect(areListGroupingOptionsSameKind('property:status', 'property-desc:Status')).toBe(true);
        expect(areListGroupingOptionsSameKind('property:status', 'property:genre')).toBe(false);
        expect(areListGroupingOptionsSameKind('property:scheduled', 'property-day:scheduled')).toBe(false);
        expect(areListGroupingOptionsSameKind('property:status', 'line-property:status')).toBe(false);
        expect(areListGroupingOptionsSameKind('property-day:scheduled', 'property-day-desc:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('line-property-day:scheduled', 'line-property-day-desc:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('date', 'date')).toBe(true);
        expect(areListGroupingOptionsSameKind('property:status', 'custom')).toBe(false);
    });
});

describe('pruneUnavailablePropertyGroupingOverrides', () => {
    it('removes overrides for unregistered keys and keeps the rest', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertySortKey = 'status, genre';
        settings.folderAppearances.Projects = { groupBy: 'property:status' };
        settings.folderAppearances.Archive = { groupBy: 'property:removed' };
        settings.folderAppearances.Mixed = { groupBy: 'property:removed', mode: 'compact' };
        settings.tagAppearances.reading = { groupBy: 'date' };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:status');
        // Grouping-only records are dropped entirely; records with other fields keep those fields.
        expect(settings.folderAppearances.Archive).toBeUndefined();
        expect(settings.folderAppearances.Mixed).toEqual({ mode: 'compact' });
        expect(settings.tagAppearances.reading.groupBy).toBe('date');
    });

    it('removes overrides referencing the manual sort key', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertySortKey = `status, ${settings.manualSortPropertyKey}`;
        settings.folderAppearances.Projects = { groupBy: createPropertyGroupingOption(settings.manualSortPropertyKey) };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(true);
        expect(settings.folderAppearances.Projects).toBeUndefined();
    });

    it('reports no change when every override is available', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertySortKey = 'status';
        settings.folderAppearances.Projects = { groupBy: 'property:Status' };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(false);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:Status');
    });
});

describe('updatePropertyGroupingOverrideKeys', () => {
    it('rewrites overrides after a property rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property:Status' };
        settings.tagAppearances.reading = { groupBy: 'date' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', 'State')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:State');
        expect(settings.tagAppearances.reading.groupBy).toBe('date');
    });

    it('preserves the group order direction across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property-desc:Status' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', 'State')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property-desc:State');
    });

    it('preserves calendar-day granularity across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property-day-desc:Scheduled' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'scheduled', 'Start')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property-day-desc:Start');
    });

    it('preserves line-only source across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'line-property-day-desc:Scheduled' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'scheduled', 'Start')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('line-property-day-desc:Start');
    });

    it('removes overrides when the property is deleted', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property:status' };
        settings.folderAppearances.Mixed = { groupBy: 'property:status', mode: 'compact' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', null)).toBe(true);
        // Grouping-only records are dropped entirely; records with other fields keep those fields.
        expect(settings.folderAppearances.Projects).toBeUndefined();
        expect(settings.folderAppearances.Mixed).toEqual({ mode: 'compact' });
    });
});

describe('hasEffectiveCustomListGrouping', () => {
    it('detects custom grouping forced by the default sort', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'date';
        settings.defaultFolderSort = 'title-asc';

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('detects custom grouping forced by a selection sort override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'date';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = 'title-asc';

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('combines a tag appearance with its sort override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.tagAppearances.reading = { groupBy: 'date' };
        settings.tagSortOverrides.reading = 'title-asc';

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('detects custom grouping forced by a property sort override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.propertySortOverrides['property:status:active'] = 'property-asc';

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('detects custom grouping forced by manual sorting', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'property-asc';
        settings.propertySortKey = settings.manualSortPropertyKey;

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('detects manual sorting in an object override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = {
            option: 'property-desc',
            propertyKey: settings.manualSortPropertyKey
        };

        expect(hasEffectiveCustomListGrouping(settings)).toBe(true);
    });

    it('does not treat alphabetical folder grouping as custom', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = 'title-asc';

        expect(hasEffectiveCustomListGrouping(settings)).toBe(false);
    });

    it('ignores custom grouping and sort overrides owned only by source-backed Types', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]: { groupBy: 'custom' },
            [TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS]: { groupBy: 'custom' }
        };
        settings.typeSortOverrides = {
            [TPS_NAVIGATOR_TYPE_IDS.BULLETS]: 'title-asc',
            [TPS_NAVIGATOR_TYPE_IDS.TABLES]: 'title-desc'
        };

        expect(hasEffectiveCustomListGrouping(settings)).toBe(false);
    });

    it('still detects custom grouping and sort overrides for file-backed Types', () => {
        const appearanceSettings = structuredClone(DEFAULT_SETTINGS);
        appearanceSettings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.NOTES]: { groupBy: 'custom' }
        };
        expect(hasEffectiveCustomListGrouping(appearanceSettings)).toBe(true);

        const sortSettings = structuredClone(DEFAULT_SETTINGS);
        sortSettings.typeSortOverrides = {
            [TPS_NAVIGATOR_TYPE_IDS.BASES]: 'title-asc'
        };
        expect(hasEffectiveCustomListGrouping(sortSettings)).toBe(true);
    });
});
