import { useMemo } from 'react';
import type { App } from 'obsidian';
import type { NotebookNavigatorSettings } from '../../../settings/types';
import { getVisibleFileTypeFiles } from '../../../utils/selectionUtils';
import type { NavigationPaneSourceState } from './useNavigationPaneSourceState';

export function useNavigationVisibleFileTypePaths(
    app: App,
    settings: NotebookNavigatorSettings,
    showHiddenItems: boolean,
    sourceState: NavigationPaneSourceState,
    typeRevision: number
): ReadonlySet<string> {
    const visibilityTagVersion = !showHiddenItems && sourceState.hiddenFileTags.length > 0 ? sourceState.tagDataVersion : 0;
    const drawingVisibilityVersion = settings.hideDrawingPreviewImages && !showHiddenItems ? typeRevision : 0;
    const folderNoteTitleVersion = settings.enableFolderNotes && settings.hideFolderNoteInList ? sourceState.metadataDecorationVersion : 0;
    const folderNotePropertyVersion = settings.enableFolderNotes && settings.hideFolderNoteInList ? sourceState.propertyDataVersion : 0;
    return useMemo(() => {
        // Type buckets update separately. Revisit their visibility only when file
        // membership or exclusions change, not for every indexed property/icon.
        void sourceState.fileChangeVersion;
        void sourceState.folderChangeVersion;
        void sourceState.metadataVisibilityVersion;
        void sourceState.folderExclusionByFolderNote;
        void visibilityTagVersion;
        void drawingVisibilityVersion;
        void folderNoteTitleVersion;
        void folderNotePropertyVersion;
        if (!settings.tpsFileTypesNavigationEnabled) return new Set<string>();
        return new Set(getVisibleFileTypeFiles(settings, showHiddenItems, app).map(file => file.path));
    }, [
        app,
        settings,
        showHiddenItems,
        sourceState.fileChangeVersion,
        sourceState.folderChangeVersion,
        sourceState.metadataVisibilityVersion,
        sourceState.folderExclusionByFolderNote,
        visibilityTagVersion,
        drawingVisibilityVersion,
        folderNoteTitleVersion,
        folderNotePropertyVersion
    ]);
}
