import { App, TFile, type CachedMetadata, type Pos, type SectionCache } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownStructureTypesIndex, getMarkdownStructureRecordsForFile } from '../../src/services/types/markdownStructureTypes';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

function position(startLine: number, endLine = startLine, endColumn = 1): Pos {
    return {
        start: { line: startLine, col: 0, offset: startLine * 10 },
        end: { line: endLine, col: endColumn, offset: endLine * 10 + endColumn }
    };
}

function section(type: string, startLine: number, endLine = startLine, endColumn = 1, id?: string): SectionCache {
    return { type, position: position(startLine, endLine, endColumn), ...(id ? { id } : {}) };
}

function createApp(files: TFile[], caches: Map<string, CachedMetadata | null>) {
    const app = new App();
    const getFiles = vi.fn(() => files);
    const getFileCache = vi.fn((file: TFile) => caches.get(file.path) ?? null);
    const cachedRead = vi.fn(async () => {
        throw new Error('Markdown structure Types must not read note bodies');
    });
    Object.assign(app.vault, { getFiles, getMarkdownFiles: getFiles, cachedRead });
    Object.assign(app.metadataCache, { getFileCache });
    files.forEach(file => (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file));
    return { app, getFiles, getFileCache, cachedRead };
}

describe('Markdown structure Types', () => {
    it('indexes only the four explicit root-level section kinds with one-based inclusive ranges', () => {
        const file = new TFile('Notes/Structures.md');
        const cache: CachedMetadata = {
            sections: [
                section('yaml', 0, 2, 0),
                section('code', 3, 7, 0),
                section('callout', 8, 10),
                section('blockquote', 12, 12, 9, 'quote-id'),
                section('table', 14, 17),
                section('paragraph', 19),
                section('thematicBreak', 20),
                { type: 'code', position: { start: { line: -1, col: 0, offset: 0 }, end: { line: 1, col: 0, offset: 0 } } }
            ]
        };

        const records = getMarkdownStructureRecordsForFile(file, cache);

        expect(records.map(record => [record.typeId, record.label, record.lineNumber, record.lineEndNumber])).toEqual([
            [TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, 'Structures · line 4', 4, 7],
            [TPS_NAVIGATOR_TYPE_IDS.CALLOUTS, 'Structures · line 9', 9, 11],
            [TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES, 'Structures · line 13', 13, undefined],
            [TPS_NAVIGATOR_TYPE_IDS.TABLES, 'Structures · line 15', 15, 18]
        ]);
        expect(records[2]).toMatchObject({
            blockId: 'quote-id',
            referenceTarget: '[[Notes/Structures.md#^quote-id]]'
        });
    });

    it('does not index nested syntax unless Obsidian publishes it as its own root-level section', () => {
        const file = new TFile('Notes/Nested.md');
        const outerOnly: CachedMetadata = { sections: [section('callout', 0, 8)] };
        const explicitlyPublished: CachedMetadata = {
            sections: [section('callout', 0, 8), section('code', 3, 6)]
        };

        expect(getMarkdownStructureRecordsForFile(file, outerOnly).map(record => record.typeId)).toEqual([TPS_NAVIGATOR_TYPE_IDS.CALLOUTS]);
        expect(getMarkdownStructureRecordsForFile(file, explicitlyPublished).map(record => record.typeId)).toEqual([
            TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
            TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS
        ]);
    });

    it('excludes Excalidraw Markdown and never reads file bodies', () => {
        const drawing = new TFile('Drawings/Diagram.md');
        const note = new TFile('Notes/Code.md');
        const caches = new Map<string, CachedMetadata | null>([
            [drawing.path, { frontmatter: { 'excalidraw-plugin': 'parsed' }, sections: [section('code', 1, 3)] }],
            [note.path, { sections: [section('code', 4, 6)] }]
        ]);
        const context = createApp([drawing, note], caches);
        const index = new MarkdownStructureTypesIndex(context.app);

        const snapshot = index.rebuild();

        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)?.map(record => record.sourcePath)).toEqual([note.path]);
        expect(context.getFiles).toHaveBeenCalledOnce();
        expect(context.cachedRead).not.toHaveBeenCalled();
    });

    it('updates one path incrementally and removes deleted paths without rescanning the vault', () => {
        const alpha = new TFile('Notes/Alpha.md');
        const beta = new TFile('Notes/Beta.md');
        const caches = new Map<string, CachedMetadata | null>([
            [alpha.path, { sections: [section('code', 1, 2)] }],
            [beta.path, { sections: [section('table', 3, 5)] }]
        ]);
        const context = createApp([alpha, beta], caches);
        const index = new MarkdownStructureTypesIndex(context.app);
        index.rebuild();

        const updated = index.updateFile(alpha, { sections: [section('callout', 7, 9)] });
        const removed = index.removePath(beta.path);

        expect(context.getFiles).toHaveBeenCalledOnce();
        expect(updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(0);
        expect(updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)).toHaveLength(1);
        expect(removed.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(0);
        expect(context.cachedRead).not.toHaveBeenCalled();
    });

    it('refreshes a stable block-id row when only its cached end line changes', () => {
        const file = new TFile('Notes/Stable.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, { sections: [section('callout', 3, 5, 4, 'stable-callout')] }]]);
        const context = createApp([file], caches);
        const index = new MarkdownStructureTypesIndex(context.app);
        const initial = index.rebuild();
        const initialRecord = initial.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)?.[0];

        const updated = index.updateFile(file, { sections: [section('callout', 3, 8, 4, 'stable-callout')] });
        const updatedRecord = updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)?.[0];

        expect(updated.revision).toBeGreaterThan(initial.revision);
        expect(updatedRecord?.locatorKey).toBe(initialRecord?.locatorKey);
        expect(updatedRecord?.lineEndNumber).toBe(9);
    });

    it('revalidates ranges before opening and follows an existing block id after movement', async () => {
        const file = new TFile('Notes/Open.md');
        const caches = new Map<string, CachedMetadata | null>([
            [file.path, { sections: [section('code', 4, 7), section('blockquote', 10, 11, 4, 'stable-quote')] }]
        ]);
        const context = createApp([file], caches);
        const editor = {
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
            focus: vi.fn()
        };
        const leaf = {
            view: { file, editor },
            openFile: vi.fn(async () => undefined)
        };
        Object.assign(context.app, {
            workspace: {
                activeLeaf: leaf,
                getLeaf: vi.fn(() => leaf),
                getLeavesOfType: vi.fn(() => [leaf])
            }
        });
        const index = new MarkdownStructureTypesIndex(context.app);
        const snapshot = index.rebuild();
        const code = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)?.[0];
        const quote = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES)?.[0];
        expect(code).toBeDefined();
        expect(quote).toBeDefined();

        caches.set(file.path, { sections: [section('code', 5, 8), section('blockquote', 15, 16, 4, 'stable-quote')] });

        await expect(index.activate(code!)).resolves.toEqual({ ok: false, reason: 'stale-locator' });
        expect(leaf.openFile).not.toHaveBeenCalled();

        await expect(index.activate(quote!)).resolves.toEqual({ ok: true, sourcePath: file.path, lineNumber: 16 });
        expect(leaf.openFile).toHaveBeenCalledWith(file, { state: { mode: 'source' }, active: true });
        expect(editor.setCursor).toHaveBeenCalledWith({ line: 15, ch: 0 });
        expect(editor.scrollIntoView).toHaveBeenCalledWith({ from: { line: 15, ch: 0 }, to: { line: 15, ch: 0 } }, true);
        expect(editor.focus).toHaveBeenCalledOnce();
    });
});
