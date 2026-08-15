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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    activateFolderGroupHeaderNavigation,
    ListPaneGroupHeader,
    resolveVisibleStickyHeader,
    type FolderGroupHeaderTarget,
    type HeaderRenderModel
} from '../../src/components/listPane/ListPaneVirtualContent';

vi.mock('../../src/components/FileItem', () => ({ FileItem: () => null }));

function createHeader(itemCount: number | null, totalItemCount: number | null = null): HeaderRenderModel {
    return {
        index: 0,
        label: 'Today',
        baseLabel: 'Today',
        isFirstHeader: true,
        isPinnedHeader: false,
        collapseKey: 'date:today',
        isCollapsed: false,
        isCollapsible: true,
        folderGroupHeaderTarget: null,
        folderGroupHeaderPath: null,
        folderGroupHeaderSegments: [],
        groupFilePaths: ['First.md', 'Second.md', 'Third.md'],
        itemCount,
        totalItemCount,
        manualSortHeaderFilePath: null,
        manualSortHeader: null,
        manualSortHeaderWordCount: 0,
        manualSortHeaderTargetWordCount: null,
        folderIconId: null,
        folderColor: null,
        applyFolderColorToLabel: false
    };
}

function renderHeader(itemCount: number | null, totalItemCount: number | null = null): string {
    return renderToStaticMarkup(
        React.createElement(ListPaneGroupHeader, {
            header: createHeader(itemCount, totalItemCount),
            collapseChevronIcons: { collapsed: 'chevron-right', expanded: 'chevron-down' },
            pinnedSectionIcon: '',
            onPinnedGroupHeaderToggle: () => {},
            onListGroupHeaderToggle: () => {},
            onFolderGroupHeaderClick: () => {},
            onFolderGroupHeaderMouseDown: () => {},
            onGroupHeaderContextMenu: () => {}
        })
    );
}

describe('ListPaneGroupHeader item count', () => {
    it('renders the configured item count before the collapse control', () => {
        const markup = renderHeader(3);
        const countIndex = markup.indexOf('<span class="tps-nn-list-group-header-item-count">(3)</span>');
        const collapseIndex = markup.indexOf('tps-nn-list-group-header-collapse-button');

        expect(countIndex).toBeGreaterThan(-1);
        expect(collapseIndex).toBeGreaterThan(countIndex);
    });

    it('renders the filtered and total item counts during search', () => {
        expect(renderHeader(3, 8)).toContain('<span class="tps-nn-list-group-header-item-count">(3/8)</span>');
    });

    it('omits the item count when the setting is disabled', () => {
        expect(renderHeader(null)).not.toContain('tps-nn-list-group-header-item-count');
    });
});

describe('resolveVisibleStickyHeader', () => {
    it('suppresses a stale sticky header while the list renders its empty state', () => {
        const header = createHeader(0);

        expect(resolveVisibleStickyHeader(header, false, true)).toBeNull();
        expect(resolveVisibleStickyHeader(header, true, false)).toBeNull();
    });

    it('keeps the active sticky header for a populated selection', () => {
        const header = createHeader(3);

        expect(resolveVisibleStickyHeader(header, false, false)).toBe(header);
    });
});

describe('folder group header navigation', () => {
    it('resets search after successful folder scope changes for plain and folder-note headers', () => {
        const folder = new TFolder('Projects');
        const onNavigateToFolder = vi.fn(() => true);
        const onResetSearchForNavigation = vi.fn();
        const target: FolderGroupHeaderTarget = { folder, folderNote: null };

        activateFolderGroupHeaderNavigation({
            target,
            suppressAutoSelect: false,
            onNavigateToFolder,
            onResetSearchForNavigation
        });

        expect(onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(onNavigateToFolder).toHaveBeenCalledWith(folder.path, { source: 'manual', suppressAutoSelect: false });
        expect(onNavigateToFolder.mock.invocationCallOrder[0]).toBeLessThan(onResetSearchForNavigation.mock.invocationCallOrder[0]);

        target.folderNote = new TFile('Projects/Projects.md');
        activateFolderGroupHeaderNavigation({
            target,
            suppressAutoSelect: true,
            onNavigateToFolder,
            onResetSearchForNavigation
        });
        expect(onResetSearchForNavigation).toHaveBeenCalledTimes(2);
        expect(onNavigateToFolder).toHaveBeenLastCalledWith(folder.path, { source: 'manual', suppressAutoSelect: true });
    });

    it('preserves search when folder group navigation fails', () => {
        const onResetSearchForNavigation = vi.fn();
        const onNavigateToFolder = vi.fn(() => false);

        expect(
            activateFolderGroupHeaderNavigation({
                target: { folder: new TFolder('Missing'), folderNote: null },
                suppressAutoSelect: false,
                onNavigateToFolder,
                onResetSearchForNavigation
            })
        ).toBe(false);
        expect(onNavigateToFolder).toHaveBeenCalledOnce();
        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
    });
});
