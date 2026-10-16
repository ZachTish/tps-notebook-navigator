import { describe, expect, it, vi } from 'vitest';
import { App, type CachedMetadata, type TFile } from 'obsidian';
import { PropertyOperations } from '../../../src/services/PropertyOperations';
import { PropertyFileMutations } from '../../../src/services/propertyOperations/PropertyFileMutations';
import {
    replacePropertyValue,
    collectPropertyValueReplacements,
    type PropertyValueRename
} from '../../../src/services/propertyOperations/propertyValueRename';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaultSettings';
import { createTestTFile } from '../../utils/createTestTFile';

const rename: PropertyValueRename = { key: 'kind', oldValue: 'transaction', newValue: 'record', includeDescendants: true };

describe('property value rename semantics', () => {
    it.each([
        ['transaction', 'record'],
        ['Transaction/Financial/Investment', 'record/Financial/Investment'],
        ['transactional/financial', 'transactional/financial'],
        ['other/transaction', 'other/transaction'],
        [
            ['transaction/financial', 'keep'],
            ['record/financial', 'keep']
        ],
        [
            ['transaction', 'record', 'keep', 'keep'],
            ['record', 'keep', 'keep']
        ],
        [['transaction', 'transaction'], ['record']],
        [null, null],
        [{ nested: 'transaction' }, { nested: 'transaction' }],
        ['https://transaction/financial', 'https://transaction/financial'],
        ['[[transaction/financial]]', '[[transaction/financial]]'],
        ['[transaction](https://example.com)', '[transaction](https://example.com)'],
        ['transaction//financial', 'transaction//financial']
    ])('preserves unrelated shapes and path boundaries: %j', (input, expected) => {
        expect(replacePropertyValue(input, rename)).toEqual(expected);
    });
    it('supports exact-only and case-only renames', () => {
        expect(replacePropertyValue('transaction/financial', { ...rename, includeDescendants: false })).toBe('transaction/financial');
        expect(replacePropertyValue('transaction', { ...rename, newValue: 'Transaction' })).toBe('Transaction');
    });
    it('preserves numeric and boolean types and rejects invalid conversions', () => {
        expect(replacePropertyValue(12, { ...rename, oldValue: '12', newValue: '13.5' })).toBe(13.5);
        expect(replacePropertyValue(true, { ...rename, oldValue: 'true', newValue: 'false' })).toBe(false);
        for (const newValue of ['text', 'Infinity', ''])
            expect(() => replacePropertyValue(12, { ...rename, oldValue: '12', newValue })).toThrow();
        expect(() => replacePropertyValue(true, { ...rename, oldValue: 'true', newValue: 'done' })).toThrow();
    });
    it('leaves unsupported non-finite numeric values unchanged', () => {
        expect(replacePropertyValue(Infinity, { ...rename, oldValue: 'Infinity', newValue: '5' })).toBe(Infinity);
        expect(replacePropertyValue(NaN, { ...rename, oldValue: 'NaN', newValue: '5' })).toBeNaN();
    });
    it('replaces complete link values without changing linked files or interpreting URLs as branches', () => {
        expect(replacePropertyValue('[[Food|Lunch]]', { ...rename, oldValue: '[[Food|Lunch]]', newValue: '[[Meal|Dinner]]' })).toBe(
            '[[Meal|Dinner]]'
        );
        expect(() => replacePropertyValue('transaction/financial', { ...rename, newValue: '[[Record]]' })).toThrow();
    });
    it('changes matching keys only and never mutates the metadata preflight', () => {
        const fm = { Kind: ['transaction/financial', 'keep'], other: 'transaction' };
        expect([...collectPropertyValueReplacements(fm, rename)]).toEqual([['Kind', ['record/financial', 'keep']]]);
        expect(fm).toEqual({ Kind: ['transaction/financial', 'keep'], other: 'transaction' });
    });
});

function fixture(size = 1000) {
    const app = new App();
    const metadata = new Map<string, CachedMetadata>();
    const source = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < size; i++) {
        const file = createTestTFile(`${i < 3 ? 'Hidden' : 'Notes'}/${i}.md`);
        (app.vault as unknown as { registerFile: (file: TFile) => void }).registerFile(file);
        const fm = { kind: i < 3 ? ['transaction/financial', 'keep'] : ['entity'], untouched: i };
        metadata.set(file.path, { frontmatter: structuredClone(fm) });
        source.set(file.path, fm);
    }
    const inventory = vi.spyOn(app.vault, 'getMarkdownFiles');
    const read = vi.spyOn(app.vault, 'cachedRead');
    Object.assign(app.metadataCache, { getFileCache: (file: TFile) => metadata.get(file.path) ?? null });
    const writer = vi.fn(async (file: TFile, update: (fm: Record<string, unknown>) => void) => {
        update(source.get(file.path)!);
        metadata.set(file.path, { frontmatter: structuredClone(source.get(file.path)!) });
    });
    app.fileManager.processFrontMatter = writer;
    const save = vi.fn();
    const operations = new PropertyOperations(
        app,
        () => structuredClone(DEFAULT_SETTINGS),
        save,
        () => null,
        () => false
    );
    return { app, metadata, source, inventory, read, writer, save, operations };
}

describe('explicit property value batch owner', () => {
    it('mutates only matching notes across a 1000-note inventory, including hidden paths; repeating is zero-work', async () => {
        const f = fixture();
        expect(await f.operations.renamePropertyValue(rename)).toBe(true);
        expect(f.inventory).toHaveBeenCalledTimes(1);
        expect(f.writer).toHaveBeenCalledTimes(3);
        expect(f.read).not.toHaveBeenCalled();
        expect(f.save).not.toHaveBeenCalled();
        expect(f.source.get('Hidden/0.md')).toEqual({ kind: ['record/financial', 'keep'], untouched: 0 });
        expect(f.source.get('Notes/999.md')).toEqual({ kind: ['entity'], untouched: 999 });
        await f.operations.renamePropertyValue(rename);
        expect(f.writer).toHaveBeenCalledTimes(3);
    });
    it('same-value confirmation does not collapse aliases or enter the file queue', async () => {
        const f = fixture(3);
        await f.operations.renamePropertyValue({ ...rename, newValue: rename.oldValue });
        expect(f.inventory).not.toHaveBeenCalled();
        expect(f.writer).not.toHaveBeenCalled();
    });
    it('unknown metadata or invalid typed targets abort before any mutation', async () => {
        const f = fixture(4);
        f.metadata.delete('Notes/3.md');
        expect(await f.operations.renamePropertyValue(rename)).toBe(false);
        expect(f.writer).not.toHaveBeenCalled();
        f.metadata.set('Notes/3.md', { frontmatter: { kind: true } });
        expect(await f.operations.renamePropertyValue({ ...rename, oldValue: 'true', newValue: 'invalid' })).toBe(false);
        expect(f.writer).not.toHaveBeenCalled();
    });
    it('rechecks current source instead of overwriting a concurrent edit', async () => {
        const f = fixture(3);
        f.source.set('Hidden/0.md', { kind: ['entity'], bodyMarker: 'newer' });
        await f.operations.renamePropertyValue(rename);
        expect(f.source.get('Hidden/0.md')).toEqual({ kind: ['entity'], bodyMarker: 'newer' });
        expect(f.source.get('Hidden/1.md')?.kind).toEqual(['record/financial', 'keep']);
    });
    it('rejects a file removed before its turn and reports partial failures without retry', async () => {
        const f = fixture(3);
        f.writer.mockImplementationOnce(async () => {
            (f.app.vault as unknown as { unregisterFile: (path: string) => void }).unregisterFile('Hidden/1.md');
            throw new Error('write denied');
        });
        expect(await f.operations.renamePropertyValue(rename)).toBe(true);
        expect(f.writer).toHaveBeenCalledTimes(2);
        expect(f.source.get('Hidden/2.md')?.kind).toEqual(['record/financial', 'keep']);
    });
    it('atomic mutation also rejects non-Markdown and leaves unrelated fields intact', async () => {
        const f = fixture(1);
        const mutations = new PropertyFileMutations(f.app);
        expect(await mutations.renamePropertyValueInFile(createTestTFile('File.txt'), rename)).toBe(false);
        expect(f.writer).not.toHaveBeenCalled();
    });
});
