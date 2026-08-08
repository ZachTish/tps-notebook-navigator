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

import { useMemo } from 'react';
import { useSettingsState } from '../context/SettingsContext';
import { useNavigationSelection } from '../context/SelectionContext';
import type { ListDisplayMode, ListNoteGroupingOption, NotebookNavigatorSettings } from '../settings/types';
import { ItemType } from '../types';
import { resolveListGroupingOverride } from '../utils/listGrouping';
import { isTpsNavigatorLineTypeId, isTpsNavigatorStructuralTypeId } from '../types/navigatorTypes';

export interface FolderAppearance {
    mode?: ListDisplayMode;
    titleRows?: number;
    previewRows?: number;
    groupBy?: ListNoteGroupingOption;
    /** Property resolution for exact structural-line Type sorting and grouping. */
    linePropertyInheritance?: LinePropertyInheritance;
    /** Whether multi-valued properties create one group per value or one combined group. */
    multiValueGrouping?: MultiValueGrouping;
}

export type TagAppearance = FolderAppearance;

/** Determines how a structural line item's properties are inherited from its owning note. */
export type LinePropertyInheritance = 'note-first' | 'line-first' | 'combine';
export type MultiValueGrouping = 'separate' | 'combine';

export function isMultiValueGrouping(value: unknown): value is MultiValueGrouping {
    return value === 'separate' || value === 'combine';
}

export function resolveMultiValueGrouping(value: unknown): MultiValueGrouping {
    return isMultiValueGrouping(value) ? value : 'separate';
}

export function isLinePropertyInheritance(value: unknown): value is LinePropertyInheritance {
    return value === 'note-first' || value === 'line-first' || value === 'combine';
}

export function resolveLinePropertyInheritance(value: unknown): LinePropertyInheritance {
    return isLinePropertyInheritance(value) ? value : 'line-first';
}

export interface ListPaneAppearanceSettings {
    mode: ListDisplayMode;
    titleRows: number;
    previewRows: number;
    showDate: boolean;
    showPreview: boolean;
    showImage: boolean;
    groupBy: ListNoteGroupingOption;
    multiValueGrouping: MultiValueGrouping;
}

export function getDefaultListMode(settings: NotebookNavigatorSettings): ListDisplayMode {
    return settings.defaultListMode === 'compact' ? 'compact' : 'standard';
}

/**
 * Resolve the effective list mode for a folder/tag appearance.
 */
export function resolveListMode({
    appearance,
    defaultMode
}: {
    appearance?: FolderAppearance;
    defaultMode: ListDisplayMode;
}): ListDisplayMode {
    if (appearance?.mode === 'compact' || appearance?.mode === 'standard') {
        return appearance.mode;
    }

    return defaultMode;
}

interface VisibilityDefaults {
    showFileDate: boolean;
    showFilePreview: boolean;
    showFeatureImage: boolean;
}

/** Return visibility flags for a given list mode */
function getVisibilityForMode(mode: ListDisplayMode, defaults: VisibilityDefaults) {
    if (mode === 'compact') {
        return {
            showDate: false,
            showPreview: false,
            showImage: false
        };
    }

    return {
        showDate: defaults.showFileDate,
        showPreview: defaults.showFilePreview,
        showImage: defaults.showFeatureImage
    };
}

/**
 * Hook to get effective appearance settings for the current selection (folder or tag)
 * Merges folder/tag-specific settings with defaults
 */
export function useListPaneAppearance() {
    const settings = useSettingsState();
    const { selectedFolder, selectedTag, selectedProperty, selectedType, selectionType } = useNavigationSelection();
    const selectedFolderPath = selectionType === ItemType.FOLDER ? (selectedFolder?.path ?? null) : null;
    const selectedTagPath = selectionType === ItemType.TAG ? selectedTag : null;
    const selectedPropertyNodeId = selectionType === ItemType.PROPERTY ? selectedProperty : null;
    const selectedStructuralTypeId = selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectedType) ? selectedType : null;
    const isSelectedLineType = isTpsNavigatorLineTypeId(selectedStructuralTypeId);
    const selectedAppearance =
        selectedFolderPath !== null
            ? settings.folderAppearances?.[selectedFolderPath]
            : selectedTagPath !== null
              ? settings.tagAppearances?.[selectedTagPath]
              : selectedPropertyNodeId !== null
                ? settings.propertyAppearances?.[selectedPropertyNodeId]
                : selectedStructuralTypeId !== null
                  ? settings.typeAppearances?.[selectedStructuralTypeId]
                  : undefined;
    const selectedMode = isSelectedLineType ? undefined : selectedAppearance?.mode;
    const selectedTitleRows = isSelectedLineType ? undefined : selectedAppearance?.titleRows;
    const selectedPreviewRows = isSelectedLineType ? undefined : selectedAppearance?.previewRows;
    const selectedGroupBy = selectedAppearance?.groupBy;
    const selectedMultiValueGrouping = selectedAppearance?.multiValueGrouping;
    const { defaultListMode, fileNameRows, noteGrouping, previewRows, showFeatureImage, showFileDate, showFilePreview } = settings;

    return useMemo<ListPaneAppearanceSettings>(() => {
        const defaultMode = defaultListMode === 'compact' ? 'compact' : 'standard';
        const appearance = {
            mode: selectedMode,
            titleRows: selectedTitleRows,
            previewRows: selectedPreviewRows
        };
        const mode = resolveListMode({ appearance, defaultMode });
        const visibility = getVisibilityForMode(mode, { showFileDate, showFilePreview, showFeatureImage });
        const grouping = resolveListGroupingOverride({
            noteGrouping,
            selectionType,
            groupBy: selectedGroupBy
        });
        return {
            mode,
            titleRows: selectedTitleRows ?? fileNameRows,
            previewRows: selectedPreviewRows ?? previewRows,
            showDate: visibility.showDate,
            showPreview: visibility.showPreview,
            showImage: visibility.showImage,
            groupBy: grouping.effectiveGrouping,
            multiValueGrouping: resolveMultiValueGrouping(selectedMultiValueGrouping)
        };
    }, [
        defaultListMode,
        fileNameRows,
        noteGrouping,
        previewRows,
        selectedMode,
        selectedTitleRows,
        selectedPreviewRows,
        selectedGroupBy,
        selectedMultiValueGrouping,
        showFeatureImage,
        showFileDate,
        showFilePreview,
        selectionType
    ]);
}
