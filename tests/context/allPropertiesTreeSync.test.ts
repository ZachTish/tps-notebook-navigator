import { describe, expect, it, vi } from 'vitest';
import type { Dispatch, SetStateAction } from 'react';
import { App, type TFile } from 'obsidian';
import type { FileContentChange, FileData } from '../../src/storage/IndexedDBStorage';
import { usePropertyTreeSync } from '../../src/context/storage/usePropertyTreeSync';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { StorageFileData } from '../../src/context/storage/storageFileData';
import { createTestTFile } from '../utils/createTestTFile';

const harness = vi.hoisted(() => ({
    effects: [] as (() => unknown)[],
    contentListener: null as ((changes: FileContentChange[]) => void) | null,
    files: new Map<string, FileData>()
}));
vi.mock('react', async original => ({
    ...(await original<typeof import('react')>()),
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useRef: (current: unknown) => ({ current }),
    useEffect: (fn: () => unknown) => {
        harness.effects.push(fn);
    }
}));
vi.mock('../../src/storage/fileOperations', () => ({
    getDBInstance: () => ({
        getFile: (path: string) => harness.files.get(path),
        onContentChange: (fn: (changes: FileContentChange[]) => void) => {
            harness.contentListener = fn;
            return () => {};
        }
    })
}));

describe('property tree discovery owner', () => {
    it('builds unconfigured keys from existing cache and responds to new-key events without a body scan', () => {
        harness.effects = [];
        harness.files.clear();
        const app = new App();
        const file = createTestTFile('Notes/Example.md');
        (app.vault as unknown as { registerFile: (file: TFile) => void }).registerFile(file);
        Object.assign(app, { workspace: { getActiveFile: () => file } });
        Object.assign(app.vault, { on: vi.fn(), offref: vi.fn() });
        const bodyRead = vi.spyOn(app.vault, 'cachedRead');
        const inventory = vi.spyOn(app.vault, 'getMarkdownFiles');
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.showProperties = true;
        settings.vaultProfiles[0].propertyKeys = [];
        harness.files.set(file.path, { properties: [{ fieldKey: 'Unconfigured', value: 'one/two' }] } as FileData);
        const schedule = vi.fn();
        const sync = usePropertyTreeSync({
            app,
            settings,
            showHiddenItems: true,
            hiddenFolders: [],
            hiddenFileProperties: [],
            hiddenFileNames: [],
            hiddenFileTags: [],
            fileVisibility: settings.vaultProfiles[0].fileVisibility,
            profileId: settings.vaultProfiles[0].id,
            isStorageReady: true,
            isStorageReadyRef: { current: true },
            latestSettingsRef: { current: settings },
            stoppedRef: { current: false },
            setFileData: vi.fn<Dispatch<SetStateAction<StorageFileData>>>(),
            getVisibleMarkdownFiles: () => [file],
            propertyTreeService: null,
            scheduleTreeRebuild: schedule,
            propertyTreeRebuildFnRef: { current: null }
        });
        expect(sync.rebuildPropertyTree().get('unconfigured')?.notesWithValue.has(file.path)).toBe(true);
        harness.effects.forEach(fn => fn());
        harness.contentListener!([
            {
                path: file.path,
                changes: { properties: [{ fieldKey: 'NewKey', value: 'value' }] },
                changedPropertyKeys: ['newkey']
            }
        ]);
        expect(schedule).toHaveBeenCalledTimes(1);
        for (let i = 0; i < 100; i++) harness.contentListener!([{ path: file.path, changes: {} }]);
        expect(schedule).toHaveBeenCalledTimes(1);
        expect(bodyRead).not.toHaveBeenCalled();
        expect(inventory).not.toHaveBeenCalled();
    });
});
