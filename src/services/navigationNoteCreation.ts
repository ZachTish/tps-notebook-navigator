import type { App } from 'obsidian';
import type { FileSystemOperations } from './FileSystemService';
import type { NavigationSearchCreationTarget } from './types/searchResourceCreation';
import type { ManualSortNewFilePlacementContext } from '../utils/manualSort';
import { resolveFolderShortcutTarget } from '../utils/shortcutPathResolver';

/** Dispatch a resolved navigation facet through the existing note creator and opening owner. */
export async function createNoteForNavigationTarget(
    app: App,
    fileSystemOps: Pick<FileSystemOperations, 'createNewFile' | 'createNewFileForTag' | 'createNewFileForProperty'>,
    target: NavigationSearchCreationTarget,
    sourcePath: string,
    openInNewTab: boolean,
    manualSortContext?: ManualSortNewFilePlacementContext | null
): Promise<void> {
    if (target.type === 'folder') {
        const folder = resolveFolderShortcutTarget(app, target.path);
        if (folder) await fileSystemOps.createNewFile(folder, openInNewTab, manualSortContext);
    } else if (target.type === 'tag') {
        await fileSystemOps.createNewFileForTag(target.tag, sourcePath, openInNewTab, manualSortContext);
    } else {
        await fileSystemOps.createNewFileForProperty(target.nodeId, sourcePath, openInNewTab, manualSortContext);
    }
}
