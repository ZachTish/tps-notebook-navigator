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

import { useSelectionState } from '../context/SelectionContext';
import { useSettingsState } from '../context/SettingsContext';
import { useUXPreferences } from '../context/UXPreferencesContext';
import { strings } from '../i18n';
import { ServiceIcon } from './ServiceIcon';
import { useListActions } from '../hooks/useListActions';
import { runAsyncAction } from '../utils/async';
import { resolveUXIcon } from '../utils/uxIcons';
import type { ManualSortNewFilePlacementContext } from '../utils/manualSort';
import { ItemType } from '../types';
import {
    isVaultRootResourceScope,
    shouldShowListCreateButton,
    supportsListSortAndGroupingForSelection,
    supportsNativeListPresentationForSelection
} from './listPane/typeModeRuntime';

interface ListToolbarProps {
    isSearchActive?: boolean;
    onSearchToggle?: () => void;
    onManualSortStart?: (propertyKey: string) => void;
    getManualSortNewFileContext?: () => ManualSortNewFilePlacementContext | null;
    canToggleGroupExpansion: boolean;
    shouldCollapseGroups: boolean;
    onToggleGroupExpansion: () => boolean;
    mixedStructuralSearchActive?: boolean;
    useFloatingLayout?: boolean;
}

export function ListToolbar({
    isSearchActive,
    onSearchToggle,
    onManualSortStart,
    getManualSortNewFileContext,
    canToggleGroupExpansion,
    shouldCollapseGroups,
    onToggleGroupExpansion,
    mixedStructuralSearchActive = false,
    useFloatingLayout = false
}: ListToolbarProps) {
    const uxPreferences = useUXPreferences();
    const includeDescendantNotes = uxPreferences.includeDescendantNotes;
    const selectionState = useSelectionState();
    const settings = useSettingsState();
    const listVisibility = settings.toolbarVisibility.list;
    const showRevealButton = listVisibility.reveal;

    // Use the shared actions hook
    const {
        handleNewFile,
        canCreateNewFile,
        newItemLabel,
        newItemIcon,
        handleRevealFile,
        canRevealFile,
        handleAppearanceMenu,
        handleSortMenu,
        handleToggleDescendants,
        descendantsTooltip,
        getSortIcon,
        hasAppearanceOrSortSelection,
        hasCustomSortOrGroup,
        hasCustomAppearance
    } = useListActions({
        onManualSortStart,
        getManualSortNewFileContext,
        trackRevealFileAvailability: showRevealButton,
        mixedStructuralSearchActive
    });

    const isTypeSelection = selectionState.selectionType === ItemType.TYPE && Boolean(selectionState.selectedType);
    const supportsNativeListPresentation = supportsNativeListPresentationForSelection(
        selectionState.selectionType,
        selectionState.selectedType
    );
    const supportsListSortAndGrouping = supportsListSortAndGroupingForSelection(selectionState.selectionType, selectionState.selectedType);
    const showSearchButton = listVisibility.search;
    const showDescendantsButton = !isTypeSelection && listVisibility.descendants;
    const isVaultRootScope = isVaultRootResourceScope(selectionState.selectionType, selectionState.selectedFolder?.path);
    const effectiveIncludeDescendants = includeDescendantNotes || isVaultRootScope;
    const effectiveDescendantsTooltip = isVaultRootScope
        ? 'All visible resources from subfolders are included at the vault root'
        : descendantsTooltip;
    const showGroupExpansionButton = supportsListSortAndGrouping && listVisibility.groupExpansion;
    const showSortButton = supportsListSortAndGrouping && listVisibility.sort;
    const showAppearanceButton = supportsNativeListPresentation && listVisibility.appearance;
    const showNewNoteButton = shouldShowListCreateButton(selectionState.selectionType, canCreateNewFile, listVisibility.newNote);
    const showEffectiveRevealButton = !isTypeSelection && showRevealButton;
    const hasNavigationSelection = Boolean(
        selectionState.selectedFolder || selectionState.selectedTag || selectionState.selectedProperty || selectionState.selectedType
    );

    const leftButtonCount = [
        showSearchButton,
        showEffectiveRevealButton,
        showDescendantsButton,
        showGroupExpansionButton,
        showSortButton,
        showAppearanceButton
    ].filter(Boolean).length;
    const totalButtonCount = leftButtonCount + (showNewNoteButton ? 1 : 0);
    const leftGroupClassName = leftButtonCount === 1 ? 'nn-mobile-toolbar-circle' : 'nn-mobile-toolbar-pill';
    const leftButtonBaseClassName =
        leftButtonCount === 1 ? 'nn-mobile-toolbar-button nn-mobile-toolbar-button-circle' : 'nn-mobile-toolbar-button';

    if (totalButtonCount === 0) {
        return null;
    }

    const leftButtons = [
        showSearchButton ? (
            <button
                key="search"
                className={`${leftButtonBaseClassName}${isSearchActive ? ' nn-mobile-toolbar-button-active' : ''}`}
                aria-label={strings.paneHeader.search}
                onClick={onSearchToggle}
                disabled={!hasNavigationSelection}
                tabIndex={-1}
            >
                <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-search')} />
            </button>
        ) : null,
        showEffectiveRevealButton ? (
            <button
                key="reveal"
                className={leftButtonBaseClassName}
                aria-label={strings.commands.revealFile}
                onClick={() => {
                    runAsyncAction(() => handleRevealFile());
                }}
                disabled={!canRevealFile}
                tabIndex={-1}
            >
                <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-reveal-file')} />
            </button>
        ) : null,
        showDescendantsButton ? (
            <button
                key="descendants"
                className={`${leftButtonBaseClassName}${effectiveIncludeDescendants ? ' nn-mobile-toolbar-button-active' : ''}`}
                aria-label={effectiveDescendantsTooltip}
                onClick={handleToggleDescendants}
                disabled={!hasNavigationSelection || isVaultRootScope}
                tabIndex={-1}
            >
                <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-descendants')} />
            </button>
        ) : null,
        showGroupExpansionButton ? (
            <button
                key="group-expansion"
                className={leftButtonBaseClassName}
                aria-label={shouldCollapseGroups ? strings.paneHeader.collapseAllListGroups : strings.paneHeader.expandAllListGroups}
                onClick={() => {
                    onToggleGroupExpansion();
                }}
                disabled={!canToggleGroupExpansion}
                tabIndex={-1}
            >
                <ServiceIcon
                    iconId={resolveUXIcon(settings.interfaceIcons, shouldCollapseGroups ? 'list-collapse-all' : 'list-expand-all')}
                />
            </button>
        ) : null,
        showSortButton ? (
            <button
                key="sort"
                className={`${leftButtonBaseClassName}${hasCustomSortOrGroup ? ' nn-mobile-toolbar-button-active' : ''}`}
                aria-label={strings.paneHeader.changeSortAndGroup}
                onClick={handleSortMenu}
                disabled={!hasAppearanceOrSortSelection}
                tabIndex={-1}
            >
                <ServiceIcon iconId={getSortIcon()} />
            </button>
        ) : null,
        showAppearanceButton ? (
            <button
                key="appearance"
                className={`${leftButtonBaseClassName}${hasCustomAppearance ? ' nn-mobile-toolbar-button-active' : ''}`}
                aria-label={strings.paneHeader.changeAppearance}
                onClick={handleAppearanceMenu}
                disabled={!hasAppearanceOrSortSelection}
                tabIndex={-1}
            >
                <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-appearance')} />
            </button>
        ) : null
    ].filter(Boolean);
    const newNoteButton = showNewNoteButton ? (
        <button
            key="new-note"
            className="nn-mobile-toolbar-button nn-mobile-toolbar-button-circle"
            aria-label={newItemLabel}
            onClick={() => {
                runAsyncAction(() => handleNewFile());
            }}
            disabled={!canCreateNewFile}
            tabIndex={-1}
        >
            <ServiceIcon iconId={newItemIcon} />
        </button>
    ) : null;

    if (!useFloatingLayout) {
        return (
            <div className="nn-mobile-toolbar">
                {leftButtons}
                {newNoteButton}
            </div>
        );
    }

    return (
        <div className="nn-mobile-toolbar">
            <div className="nn-mobile-toolbar-left">
                {leftButtonCount > 0 ? <div className={leftGroupClassName}>{leftButtons}</div> : null}
            </div>

            {showNewNoteButton ? (
                <div className="nn-mobile-toolbar-right">
                    <div className="nn-mobile-toolbar-circle">{newNoteButton}</div>
                </div>
            ) : null}
        </div>
    );
}
