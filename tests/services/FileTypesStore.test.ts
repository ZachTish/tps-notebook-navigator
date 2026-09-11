import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { FileTypesStore } from '../../src/services/types/FileTypesStore';
import { TypesAPI } from '../../src/api/modules/TypesAPI';
import { createTestTFile } from '../utils/createTestTFile';

afterEach(() => vi.useRealTimers());

function fixture() {
    const files: TFile[] = ['a.md', 'board.canvas', 'table.base', 'image.png'].map(createTestTFile);
    const events = new Map<string, () => void>();
    const read = vi.fn(() => {
        throw new Error('File types must not read bodies');
    });
    const getFiles = vi.fn(() => files);
    const on = vi.fn((name: string, callback: () => void) => {
        events.set(name, callback);
        return { name };
    });
    const app = {
        vault: {
            getFiles,
            read,
            cachedRead: read,
            on,
            offref: vi.fn((ref: { name: string }) => events.delete(ref.name))
        },
        metadataCache: { getFileCache: () => null }
    } as unknown as App;
    return { app, files, events, read, getFiles, on };
}

describe('File types replacement', () => {
    it('publishes only whole-file collections without reading bodies or calling a provider', () => {
        const { app, read, on } = fixture();
        const api = new TypesAPI(new FileTypesStore(app), true, null);
        const stop = api.subscribe(() => {});
        const snapshot = api.getInternalSnapshot();
        expect(snapshot.availability).toBe('ready');
        expect(snapshot.descriptors.map(d => d.label)).toEqual([
            'Markdown',
            'Bases',
            'Canvas',
            'Drawings',
            'PDFs',
            'Images',
            'Audio',
            'Video'
        ]);
        expect([...snapshot.recordsByType.values()].flat().every(row => row.entityType === 'file')).toBe(true);
        expect(read).not.toHaveBeenCalled();
        expect(on).not.toHaveBeenCalledWith('modify', expect.anything());
        stop();
        api.dispose();
    });

    it('batches create/delete/rename events and cancels work after unsubscribe', () => {
        vi.useFakeTimers();
        const { app, files, events, getFiles } = fixture();
        const store = new FileTypesStore(app);
        store.setEnabled(true);
        const stop = store.subscribe(() => {});
        files.push(createTestTFile('second.base'));
        events.get('create')?.();
        events.get('rename')?.();
        vi.advanceTimersByTime(100);
        expect(store.getSnapshot().recordsByType.get('file:base')?.length).toBe(2);
        expect(getFiles).toHaveBeenCalledTimes(2);
        events.get('delete')?.();
        stop();
        vi.runAllTimers();
        expect(getFiles).toHaveBeenCalledTimes(2);
        expect(events.size).toBe(0);
    });
    it('coalesces a burst of 1,000 events over 10,000 files without reading content', () => {
        vi.useFakeTimers();
        const { app, files, events, read, getFiles } = fixture();
        files.splice(0, files.length, ...Array.from({ length: 10000 }, (_, i) => createTestTFile(`file-${i}.${i % 2 ? 'md' : 'base'}`)));
        const store = new FileTypesStore(app);
        store.setEnabled(true);
        const stop = store.subscribe(() => {});
        for (let i = 0; i < 1000; i++) events.get('rename')?.();
        vi.advanceTimersByTime(100);
        expect(getFiles).toHaveBeenCalledTimes(2);
        expect(store.getSnapshot().recordsByType.get('file:base')).toHaveLength(5000);
        expect(store.getSnapshot().recordsByType.get('entity:note')).toHaveLength(5000);
        expect(read).not.toHaveBeenCalled();
        stop();
    });
});
