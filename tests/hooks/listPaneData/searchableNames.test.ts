import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, FrontMatterCache, TFile } from 'obsidian';
import type { SearchableNameData } from '../../../src/hooks/listPaneData/searchPipeline';
import type { IndexedDBStorage } from '../../../src/storage/IndexedDBStorage';
import { createTestTFile } from '../../utils/createTestTFile';
import { parseFilterSearchTokens } from '../../../src/utils/filterSearch';

// Exercise the hook's real effects and updater functions without a DOM. Keep
// dependency/cleanup semantics so repeated navigation and disabling search
// are covered, not just the predicate selecting the fast path.
const hooks = vi.hoisted<{
    state: unknown;
    cursor: number;
    dependencies: Array<readonly unknown[]>;
    cleanups: Array<(() => void) | undefined>;
    pending: Array<() => void>;
}>(() => ({
    state: undefined,
    cursor: 0,
    dependencies: [],
    cleanups: [],
    pending: []
}));
vi.mock('react', async importOriginal => ({
    ...(await importOriginal<typeof import('react')>()),
    useState(initial: unknown) {
        if (hooks.state === undefined) hooks.state = initial;
        return [
            hooks.state,
            (next: unknown) => {
                hooks.state = typeof next === 'function' ? (next as (previous: unknown) => unknown)(hooks.state) : next;
            }
        ];
    },
    useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
        const index = hooks.cursor++;
        const previous = hooks.dependencies[index];
        if (
            previous &&
            dependencies.length === previous.length &&
            dependencies.every((value, offset) => Object.is(value, previous[offset]))
        )
            return;
        hooks.dependencies[index] = dependencies;
        hooks.pending.push(() => {
            hooks.cleanups[index]?.();
            hooks.cleanups[index] = effect() || undefined;
        });
    }
}));
import { filterListPaneFiles, useSearchableNames } from '../../../src/hooks/listPaneData/searchPipeline';

beforeEach(() => {
    hooks.cleanups.forEach(cleanup => cleanup?.());
    hooks.state = undefined;
    hooks.cursor = 0;
    hooks.dependencies = [];
    hooks.cleanups = [];
    hooks.pending = [];
});

function fixture(count = 1000) {
    const files = Array.from({ length: count }, (_, index) => createTestTFile(`Notes/${index}.md`));
    const metadata = new Map(files.map((file, index) => [file.path, { title: `Native title ${index}`, aliases: [`Alias ${index}`] }]));
    const listeners = new Set<(file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void>();
    const getFileCache = vi.fn((file: TFile) => ({ frontmatter: metadata.get(file.path) }));
    const app = {
        metadataCache: {
            getFileCache,
            on(_event: string, callback: (file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void) {
                listeners.add(callback);
                return callback;
            },
            offref(callback: (file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void) {
                listeners.delete(callback);
            }
        }
    } as unknown as App;
    const inspect = vi.fn((file: TFile) => metadata.get(file.path)?.title || file.basename);
    function render(query: string, options: { useOmnisearch?: boolean; files?: TFile[]; replacementGetter?: boolean } = {}) {
        hooks.cursor = 0;
        hooks.pending = [];
        useSearchableNames({
            app,
            baseFiles: options.files || files,
            getFileDisplayName: options.replacementGetter ? file => inspect(file) : inspect,
            searchTokens: query ? parseFilterSearchTokens(query) : null,
            useOmnisearch: options.useOmnisearch === true
        });
        hooks.pending.forEach(effect => effect());
        return hooks.state as ReadonlyMap<string, SearchableNameData>;
    }
    function update(file: TFile, title: string, aliases: string[]) {
        const frontmatter = { title, aliases };
        metadata.set(file.path, frontmatter);
        listeners.forEach(callback => callback(file, '', { frontmatter }));
    }
    return { app, files, inspect, getFileCache, render, update, listeners };
}

describe('searchable names work follows name-search demand', () => {
    it('does no full-list inspection on startup, repeated navigation, or metadata changes with no search', () => {
        const f = fixture();
        expect(f.render('').size).toBe(0);
        for (let index = 0; index < 4; index++) {
            expect(f.render('', { files: [...f.files], replacementGetter: true }).size).toBe(0);
            f.update(f.files[index], 'Changed title', ['Changed alias']);
        }
        expect(f.inspect).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.listeners.size).toBe(0);
    });

    it.each(['#kind/task', '.status=open', 'folder:Notes', 'ext:md', 'type:note'])(
        'does not inspect names for structural-only query %s',
        query => {
            const f = fixture();
            expect(f.render(query).size).toBe(0);
            expect(f.inspect).not.toHaveBeenCalled();
            expect(f.getFileCache).not.toHaveBeenCalled();
        }
    );

    it('uses Omnisearch results without building an unused native-name index', () => {
        const f = fixture();
        expect(f.render('Native title', { useOmnisearch: true }).size).toBe(0);
        expect(f.inspect).not.toHaveBeenCalled();
        expect(f.listeners.size).toBe(0);
    });

    it('enabling name search builds names once and updates only the changed note', () => {
        const f = fixture();
        f.render('');
        const names = f.render('Alias');
        expect(names.size).toBe(1000);
        expect(f.inspect).toHaveBeenCalledTimes(1000);
        expect(names.get(f.files[17].path)).toEqual({
            foldedDisplayName: 'native title 17',
            aliases: ['Alias 17'],
            foldedAliases: ['alias 17']
        });
        f.render('Native');
        expect(f.inspect).toHaveBeenCalledTimes(1000);
        f.update(f.files[17], 'Replacement', ['Special alias']);
        expect(f.inspect).toHaveBeenCalledTimes(1001);
        const changed = f.render('"Special alias"');
        const result = filterListPaneFiles({
            app: f.app,
            baseFiles: f.files,
            getDB: () => ({ getFile: () => null }) as unknown as IndexedDBStorage,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchableNames: changed,
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'alphabetical-asc',
            trimmedQuery: '"Special alias"',
            useOmnisearch: false
        });
        expect(result.files).toEqual([f.files[17]]);
        expect(result.matchedAliases.get(f.files[17].path)?.map(alias => alias.value)).toEqual(['Special alias']);
    });

    it('negative name search still indexes aliases and clearing search releases its metadata listener', () => {
        const f = fixture(2);
        expect(f.render('-Alias').size).toBe(2);
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.listeners.size).toBe(1);
        expect(f.render('').size).toBe(0);
        expect(f.listeners.size).toBe(0);
        f.update(f.files[0], 'After clearing', ['Fresh alias']);
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.render('Fresh').get(f.files[0].path)?.foldedDisplayName).toBe('after clearing');
        expect(f.inspect).toHaveBeenCalledTimes(4);
    });
});
