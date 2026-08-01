import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TPS_FILES_UPDATED_EVENT, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    GCM_TASK_ROW_CACHE_MAX_PATHS,
    GCM_TASK_ROW_METADATA_MAX_PATHS,
    GCM_TASK_ROW_PROVIDER_ID,
    GCM_TASK_ROW_QUERY_PATHS_PER_PASS,
    GcmTaskRowProvider,
    createGcmTaskRowProviderSelection
} from '../../src/integrations/gcm/GcmTaskRowProvider';
import {
    resolveGcmTaskApi,
    type GcmTaskApiLike,
    type GcmTaskLinesApiLike,
    type GcmTaskRecordLike
} from '../../src/integrations/gcm/gcmTaskApi';
import {
    NAVIGATOR_ROW_PROVIDER_MAX_ROWS,
    type NavigatorProvidedRow,
    type NavigatorRowContextMenuContext
} from '../../src/services/rows/types';

const { noticeSpy } = vi.hoisted(() => ({ noticeSpy: vi.fn() }));

vi.mock('../../src/utils/noticeUtils', () => ({ showNotice: noticeSpy }));

class EventBus {
    private readonly callbacks = new Map<string, Set<(...args: unknown[]) => void>>();

    on(name: string, callback: (...args: unknown[]) => void): { name: string; callback: (...args: unknown[]) => void } {
        const listeners = this.callbacks.get(name) ?? new Set();
        listeners.add(callback);
        this.callbacks.set(name, listeners);
        return { name, callback };
    }

    offref(ref: { name: string; callback: (...args: unknown[]) => void }): void {
        this.callbacks.get(ref.name)?.delete(ref.callback);
    }

    trigger(name: string, ...args: unknown[]): void {
        this.callbacks.get(name)?.forEach(callback => callback(...args));
    }
}

afterEach(() => {
    vi.useRealTimers();
    noticeSpy.mockReset();
});

function task(path: string, lineNumber: number, title: string, isComplete = false): GcmTaskRecordLike {
    return {
        path,
        lineNumber,
        rawLine: `- [${isComplete ? 'x' : ' '}] ${title}`,
        title,
        checkbox: isComplete ? '[x]' : '[ ]',
        marker: isComplete ? 'x' : ' ',
        status: isComplete ? 'complete' : 'todo',
        isComplete,
        tags: []
    };
}

function createApp(
    api: GcmTaskApiLike | null,
    enabled = true,
    taskLinesApi: GcmTaskLinesApiLike | null = null
): { app: App; workspace: EventBus; vault: EventBus } {
    const workspace = new EventBus();
    const vault = new EventBus();
    const plugin = api
        ? {
              api: {
                  tasks: api,
                  taskCheckboxes: { version: 1, stateForStatus: (status: unknown) => (status === 'complete' ? '[x]' : '[ ]') },
                  ...(taskLinesApi ? { taskLines: taskLinesApi } : {})
              }
          }
        : null;
    Object.assign(vault, {
        getFileByPath: vi.fn((path: string) => ({ path, extension: 'md' }))
    });
    const app = {
        workspace,
        vault,
        plugins: {
            enabledPlugins: new Set(enabled ? [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] : []),
            getPlugin: vi.fn(() => plugin),
            plugins: plugin ? { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: plugin } : {}
        }
    } as unknown as App;
    return { app, workspace, vault };
}

function setGcmApi(app: App, api: GcmTaskApiLike | null, enabled: boolean, taskLinesApi: GcmTaskLinesApiLike | null = null): void {
    const manager = (
        app as App & {
            plugins: {
                enabledPlugins: Set<string>;
                getPlugin: ReturnType<typeof vi.fn>;
                plugins: Record<string, unknown>;
            };
        }
    ).plugins;
    const plugin = api
        ? {
              api: {
                  tasks: api,
                  taskCheckboxes: { version: 1, stateForStatus: (status: unknown) => (status === 'complete' ? '[x]' : '[ ]') },
                  ...(taskLinesApi ? { taskLines: taskLinesApi } : {})
              }
          }
        : null;
    if (enabled) {
        manager.enabledPlugins.add(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    } else {
        manager.enabledPlugins.delete(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    }
    manager.getPlugin.mockImplementation(() => plugin);
    manager.plugins = plugin ? { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: plugin } : {};
}

function setGcmTaskLinesApi(app: App, taskLinesApi: GcmTaskLinesApiLike | null): void {
    const plugin = (
        app as App & {
            plugins: { plugins: Record<string, { api?: Record<string, unknown> }> };
        }
    ).plugins.plugins[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID];
    if (!plugin?.api) {
        return;
    }
    if (taskLinesApi) {
        plugin.api.taskLines = taskLinesApi;
    } else {
        delete plugin.api.taskLines;
    }
}

function menuContext(
    row: NavigatorProvidedRow | (Omit<NavigatorProvidedRow, 'providerId'> & { providerId?: string })
): NavigatorRowContextMenuContext {
    return {
        providerId: row.providerId ?? GCM_TASK_ROW_PROVIDER_ID,
        rowId: row.id,
        kind: row.kind,
        sourcePath: row.sourcePath,
        sourceLineNumber: row.sourceLineNumber,
        addItem: vi.fn(),
        addSeparator: vi.fn()
    };
}

function context(app: App, visibleFilePaths: string[]) {
    return {
        app,
        scope: {
            visibleFilePaths,
            selectionType: null,
            selectedFolderPath: null,
            selectedTag: null,
            selectedProperty: null,
            selectedType: null
        }
    };
}

describe('GcmTaskRowProvider', () => {
    it('queries only exact visible paths, filters completed tasks locally, and focuses an exact task ref', async () => {
        const list = vi.fn(async () => [
            task('Notes/one.md', 4, 'First'),
            task('Notes/one.md', 9, 'Done', true),
            task('Outside.md', 1, 'Must be discarded')
        ]);
        const focus = vi.fn(async () => true);
        const api: GcmTaskApiLike = { version: 1, list, focus };
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();

        const rows = await provider.getRows(context(app, ['Notes/one.md', 'Notes/one.md']), {
            enabled: true,
            includeCompleted: false,
            maxRowsPerFile: 10
        });

        expect(list).toHaveBeenCalledWith({ paths: ['Notes/one.md'], includeCompleted: false, maxResults: 10 });
        expect(rows.map(row => row.label)).toEqual(['First']);
        expect(rows[0]).toMatchObject({
            id: 'Notes/one.md:4',
            kind: 'tps/gcm-task',
            sourcePath: 'Notes/one.md',
            sourceLineNumber: 4,
            indicator: { type: 'checkbox', checked: false }
        });
        expect(rows[0]?.indicator?.onChange).toBeUndefined();

        await rows[0]?.activate?.();
        expect(focus).toHaveBeenCalledWith({
            path: 'Notes/one.md',
            lineNumber: 4,
            rawLine: '- [ ] First',
            title: 'First'
        });
    });

    it('re-resolves the current task and GCM task-line API when the attached-row menu opens', async () => {
        const sourceTask = task('Notes/one.md', 4, 'Initial');
        const currentTask = {
            ...sourceTask,
            rawLine: '- [>] Current title',
            title: 'Current title',
            checkbox: '[>]',
            marker: '>',
            status: 'working'
        };
        const initialParseLine = vi.fn(() => sourceTask);
        const initialTaskLines: GcmTaskLinesApiLike = { version: 1, addMenuItems: vi.fn() };
        const initialApi: GcmTaskApiLike = {
            version: 1,
            list: vi.fn(async () => [sourceTask]),
            focus: vi.fn(async () => true),
            parseLine: initialParseLine
        };
        const { app } = createApp(initialApi, true, initialTaskLines);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, [sourceTask.path]);
        const rows = await provider.getRows(providerContext, { enabled: true });
        expect(rows[0]?.contextMenu).toBeTypeOf('function');

        const currentParseLine = vi.fn(() => currentTask);
        const currentAddMenuItems = vi.fn<GcmTaskLinesApiLike['addMenuItems']>();
        const currentApi: GcmTaskApiLike = {
            version: 1,
            list: vi.fn(async () => [currentTask]),
            focus: vi.fn(async () => true),
            parseLine: currentParseLine
        };
        const currentTaskLines: GcmTaskLinesApiLike = { version: 1, addMenuItems: currentAddMenuItems };
        setGcmApi(app, currentApi, true, currentTaskLines);
        await provider.getRows(providerContext, { enabled: true });

        const menu = menuContext({ ...rows[0], providerId: GCM_TASK_ROW_PROVIDER_ID });
        rows[0]?.contextMenu?.(menu);

        expect(initialParseLine).not.toHaveBeenCalled();
        expect(currentParseLine).toHaveBeenCalledWith(currentTask.path, currentTask.lineNumber, currentTask.rawLine);
        expect(currentAddMenuItems).toHaveBeenCalledOnce();
        const currentMenuCall = currentAddMenuItems.mock.calls[0];
        expect(currentMenuCall?.[1]).toMatchObject({
            lineNumber: 5,
            lineIndex: 4,
            rawLine: currentTask.rawLine,
            title: currentTask.title,
            checkboxToken: '[>]',
            isCalendarTask: false,
            calendarAllDay: false
        });
        expect(currentMenuCall?.[2]).toEqual({ includeTags: true });
        const configureItem = vi.fn();
        currentMenuCall?.[0].addItem(configureItem);
        currentMenuCall?.[0].addSeparator();
        expect(menu.addItem).toHaveBeenCalledWith(configureItem);
        expect(menu.addSeparator).toHaveBeenCalledOnce();
    });

    it('fails closed when current task parsing is stale or the current task-line menu builder fails', async () => {
        const sourceTask = task('Notes/one.md', 4, 'Initial');
        const parseLine = vi.fn<GcmTaskApiLike['parseLine']>(() => null);
        const addMenuItems = vi.fn();
        const api: GcmTaskApiLike = {
            version: 1,
            list: vi.fn(async () => [sourceTask]),
            focus: vi.fn(async () => true),
            parseLine
        };
        const taskLines: GcmTaskLinesApiLike = { version: 1, addMenuItems };
        const { app } = createApp(api, true, taskLines);
        const provider = new GcmTaskRowProvider();
        const rows = await provider.getRows(context(app, [sourceTask.path]), { enabled: true });
        const menu = menuContext({ ...rows[0], providerId: GCM_TASK_ROW_PROVIDER_ID });

        expect(() => rows[0]?.contextMenu?.(menu)).not.toThrow();
        expect(addMenuItems).not.toHaveBeenCalled();

        parseLine.mockImplementation(() => sourceTask);
        addMenuItems.mockImplementation(() => {
            throw new Error('menu failed');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(() => rows[0]?.contextMenu?.(menu)).not.toThrow();
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] GCM task row context menu could not be built',
            expect.objectContaining({ sourcePath: sourceTask.path, lineNumber: sourceTask.lineNumber })
        );
        warn.mockRestore();
    });

    it('shows the same visible warning as Type rows when task activation cannot focus the current task', async () => {
        const sourceTask = task('Notes/one.md', 4, 'Initial');
        const focus = vi.fn(async () => false);
        const api: GcmTaskApiLike = { version: 1, list: vi.fn(async () => [sourceTask]), focus };
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const rows = await provider.getRows(context(app, [sourceTask.path]), { enabled: true });

        await expect(rows[0]?.activate?.()).resolves.toBeUndefined();
        expect(focus).toHaveBeenCalledWith(expect.objectContaining({ path: sourceTask.path, lineNumber: sourceTask.lineNumber }));
        expect(noticeSpy).toHaveBeenCalledWith('Could not open this item at its current location.', { variant: 'warning' });
    });

    it('changes task checkbox state through the canonical GCM completion API', async () => {
        const sourceTask = task('Notes/one.md', 4, 'First');
        const list = vi.fn(async () => [sourceTask]);
        const setCompletion = vi.fn(async (_ref: GcmTaskRecordLike, completed: boolean) => ({
            ok: true,
            changed: true,
            task: { ...sourceTask, isComplete: completed }
        }));
        const api = {
            version: 1,
            list,
            focus: vi.fn(async () => true),
            setCompletion
        } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();

        const rows = await provider.getRows(context(app, ['Notes/one.md']), { enabled: true });
        const onChange = rows[0]?.indicator?.onChange;

        expect(onChange).toBeTypeOf('function');
        await onChange?.(true);
        expect(setCompletion).toHaveBeenCalledWith(
            {
                path: 'Notes/one.md',
                lineNumber: 4,
                rawLine: '- [ ] First',
                title: 'First'
            },
            true
        );

        await onChange?.(false);
        expect(setCompletion).toHaveBeenLastCalledWith(expect.any(Object), false);
    });

    it('surfaces GCM mutation failures instead of leaving an optimistic checkbox committed', async () => {
        const api = {
            version: 1,
            list: vi.fn(async () => [task('Notes/one.md', 2, 'Blocked')]),
            focus: vi.fn(async () => true),
            setCheckbox: vi.fn(async () => ({ ok: false, changed: false, error: 'Task line changed.' }))
        } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const rows = await provider.getRows(context(app, ['Notes/one.md']), { enabled: true });

        await expect(rows[0]?.indicator?.onChange?.(true)).rejects.toThrow('Task line changed.');
    });

    it('caches per path and invalidates only visible paths from the namespaced GCM event', async () => {
        const list = vi.fn(async ({ paths }: { paths: string[] }) => paths.map((path, index) => task(path, index, path)));
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app, workspace } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, ['Notes/one.md', 'Notes/two.md']);
        const options = { enabled: true };

        await provider.getRows(providerContext, options);
        await provider.getRows(providerContext, options);
        expect(list).toHaveBeenCalledTimes(2);

        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, options, invalidate);
        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: ['Outside.md'] });
        expect(invalidate).not.toHaveBeenCalled();
        workspace.trigger('layout-change');
        expect(invalidate).not.toHaveBeenCalled();
        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: ['Notes/two.md'] });
        expect(invalidate).toHaveBeenCalledTimes(1);

        await provider.getRows(providerContext, options);
        expect(list).toHaveBeenCalledTimes(3);
        expect(list.mock.calls[2]?.[0]).toMatchObject({ paths: ['Notes/two.md'] });
        unsubscribe?.();
    });

    it('invalidates cached task rows for structural cross-realm Markdown vault events', async () => {
        const list = vi.fn<(filter: { paths: string[] }) => Promise<GcmTaskRecordLike[]>>(async () => [task('Notes/one.md', 4, 'Current')]);
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app, vault } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, ['Notes/one.md', 'Notes/renamed.md']);
        const options = { enabled: true };

        await provider.getRows(providerContext, options);
        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, options, invalidate);

        vault.trigger('modify', { path: 'Notes/one.md', extension: 'md' });
        expect(invalidate).toHaveBeenCalledTimes(1);
        await provider.getRows(providerContext, options);
        expect(list.mock.calls.filter(call => call[0].paths[0] === 'Notes/one.md')).toHaveLength(2);

        vault.trigger('create', { path: 'Notes/one.md', extension: 'MD' });
        vault.trigger('delete', { path: 'Notes/one.md', extension: 'md' });
        vault.trigger('rename', { path: 'Notes/renamed.md', extension: 'md' }, 'Notes/one.md');
        expect(invalidate).toHaveBeenCalledTimes(4);

        vault.trigger('modify', { path: 'Notes/one.md', extension: 'base' });
        vault.trigger('modify', { path: '', extension: 'md' });
        vault.trigger('modify', null);
        expect(invalidate).toHaveBeenCalledTimes(4);
        unsubscribe?.();
    });

    it('does not let an in-flight stale query clear a newer path invalidation', async () => {
        let resolveFirstQuery: ((records: GcmTaskRecordLike[]) => void) | undefined;
        const firstQuery = new Promise<GcmTaskRecordLike[]>(resolve => {
            resolveFirstQuery = resolve;
        });
        const list = vi
            .fn<() => Promise<GcmTaskRecordLike[]>>()
            .mockImplementationOnce(async () => firstQuery)
            .mockResolvedValueOnce([task('Notes/one.md', 4, 'Fresh')]);
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app, workspace } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, ['Notes/one.md']);
        const pendingRows = provider.getRows(providerContext, { enabled: true });
        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, { enabled: true }, invalidate);

        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: ['Notes/one.md'] });
        resolveFirstQuery?.([task('Notes/one.md', 4, 'Stale')]);

        await expect(pendingRows).resolves.toEqual([]);
        expect(invalidate).toHaveBeenCalledOnce();
        await expect(provider.getRows(providerContext, { enabled: true })).resolves.toMatchObject([{ label: 'Fresh' }]);
        expect(list).toHaveBeenCalledTimes(2);
        unsubscribe?.();
    });

    it('queries markdown paths only and bounds its cross-view path cache', async () => {
        const list = vi.fn<(filter: { paths: string[]; includeCompleted: boolean; maxResults: number }) => Promise<GcmTaskRecordLike[]>>(
            async () => []
        );
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const markdownPaths = Array.from({ length: GCM_TASK_ROW_CACHE_MAX_PATHS + 2 }, (_, index) => `Notes/${index}.md`);
        const providerContext = context(app, [...markdownPaths, 'Assets/image.png']);

        for (let offset = 0; offset < markdownPaths.length; offset += GCM_TASK_ROW_QUERY_PATHS_PER_PASS) {
            await provider.getRows(providerContext, { enabled: true });
        }

        expect(list).toHaveBeenCalledTimes(markdownPaths.length);
        expect(list.mock.calls.some(call => call[0].paths.includes('Assets/image.png'))).toBe(false);
        const cache = Reflect.get(provider, 'tasksByPath') as Map<string, readonly GcmTaskRecordLike[]>;
        expect(cache.size).toBe(GCM_TASK_ROW_CACHE_MAX_PATHS);
    });

    it('bounds its rows globally while giving each task-bearing note a fair first share', async () => {
        const pathCount = Math.floor(NAVIGATOR_ROW_PROVIDER_MAX_ROWS / 5) + 1;
        const paths = Array.from({ length: pathCount }, (_, index) => `Notes/${index}.md`);
        const list = vi.fn(async ({ paths: requestedPaths }: { paths: string[] }) =>
            Array.from({ length: 5 }, (_, index) => task(requestedPaths[0] ?? '', index, `Task ${index}`))
        );
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();

        const providerContext = context(app, paths);
        let rows = await provider.getRows(providerContext, { enabled: true, maxRowsPerFile: 5 });
        while (rows.length < NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            rows = await provider.getRows(providerContext, { enabled: true, maxRowsPerFile: 5 });
        }

        expect(rows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(new Set(rows.map(row => row.sourcePath)).size).toBe(paths.length);
    });

    it('loads large scopes in bounded passes and requests a progressive refresh', async () => {
        vi.useFakeTimers();
        const paths = Array.from({ length: GCM_TASK_ROW_QUERY_PATHS_PER_PASS + 1 }, (_, index) => `Notes/${index}.md`);
        const list = vi.fn(async () => []);
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, paths);
        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, { enabled: true }, invalidate);

        await provider.getRows(providerContext, { enabled: true });
        expect(list).toHaveBeenCalledTimes(GCM_TASK_ROW_QUERY_PATHS_PER_PASS);
        expect(invalidate).not.toHaveBeenCalled();

        await vi.runOnlyPendingTimersAsync();
        expect(invalidate).toHaveBeenCalledOnce();
        await provider.getRows(providerContext, { enabled: true });
        expect(list).toHaveBeenCalledTimes(paths.length);
        unsubscribe?.();
    });

    it('bounds invalidation metadata even after many distinct paths change', () => {
        const api = { version: 1, list: vi.fn(async () => []), focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app, workspace } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const paths = Array.from({ length: GCM_TASK_ROW_METADATA_MAX_PATHS + 1 }, (_, index) => `Notes/${index}.md`);
        const unsubscribe = provider.subscribe(context(app, paths), { enabled: true }, vi.fn());

        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths });

        const dirtyPaths = Reflect.get(provider, 'dirtyPaths') as Set<string>;
        const generations = Reflect.get(provider, 'pathGenerations') as Map<string, number>;
        expect(dirtyPaths.size).toBeLessThanOrEqual(GCM_TASK_ROW_METADATA_MAX_PATHS);
        expect(generations.size).toBeLessThanOrEqual(GCM_TASK_ROW_METADATA_MAX_PATHS);
        unsubscribe?.();
    });

    it('refreshes only when the optional GCM API lifecycle or mutation capability changes', async () => {
        const nextApi = {
            version: 1,
            list: vi.fn(async () => [task('Notes/one.md', 1, 'Available')]),
            focus: vi.fn(async () => true),
            setCheckbox: vi.fn(async () => ({ ok: true, changed: true }))
        } satisfies GcmTaskApiLike;
        const { app, workspace } = createApp(null, false);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, ['Notes/one.md']);
        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, { enabled: true }, invalidate);

        expect(await provider.getRows(providerContext, { enabled: true })).toEqual([]);
        setGcmApi(app, nextApi, true);
        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(1);
        const availableRows = await provider.getRows(providerContext, { enabled: true });
        expect(availableRows).toMatchObject([{ label: 'Available' }]);
        expect(availableRows[0]?.indicator?.onChange).toBeTypeOf('function');

        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(1);

        setGcmApi(app, null, false);
        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(2);
        await expect(provider.getRows(providerContext, { enabled: true })).resolves.toEqual([]);
        unsubscribe?.();
    });

    it('refreshes attached rows when the task-line menu capability is added, replaced, or removed', async () => {
        const sourceTask = task('Notes/one.md', 1, 'Available');
        const api = {
            version: 1,
            list: vi.fn(async () => [sourceTask]),
            focus: vi.fn(async () => true),
            parseLine: vi.fn(() => sourceTask)
        } satisfies GcmTaskApiLike;
        const { app, workspace } = createApp(api);
        const provider = new GcmTaskRowProvider();
        const providerContext = context(app, [sourceTask.path]);
        const invalidate = vi.fn();
        const unsubscribe = provider.subscribe(providerContext, { enabled: true }, invalidate);

        expect((await provider.getRows(providerContext, { enabled: true }))[0]?.contextMenu).toBeUndefined();

        const firstTaskLines: GcmTaskLinesApiLike = { version: 1, addMenuItems: vi.fn() };
        setGcmTaskLinesApi(app, firstTaskLines);
        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect((await provider.getRows(providerContext, { enabled: true }))[0]?.contextMenu).toBeTypeOf('function');

        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(1);

        const replacementTaskLines: GcmTaskLinesApiLike = { version: 1, addMenuItems: vi.fn() };
        setGcmTaskLinesApi(app, replacementTaskLines);
        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(2);

        setGcmTaskLinesApi(app, null);
        workspace.trigger('layout-change');
        expect(invalidate).toHaveBeenCalledTimes(3);
        expect((await provider.getRows(providerContext, { enabled: true }))[0]?.contextMenu).toBeUndefined();
        unsubscribe?.();
    });

    it('queries each path fairly so a task-heavy first note cannot erase later note rows', async () => {
        const list = vi.fn(async ({ paths }: { paths: string[] }) => {
            if (paths[0] === 'Notes/heavy.md') {
                return Array.from({ length: 20 }, (_, index) => task('Notes/heavy.md', index, `Heavy ${index}`));
            }
            return [task('Notes/later.md', 3, 'Later task')];
        });
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const { app } = createApp(api);
        const provider = new GcmTaskRowProvider();

        const rows = await provider.getRows(context(app, ['Notes/heavy.md', 'Notes/later.md']), {
            enabled: true,
            maxRowsPerFile: 2
        });

        expect(list).toHaveBeenCalledTimes(2);
        expect(list.mock.calls.map(call => call[0].paths)).toEqual([['Notes/heavy.md'], ['Notes/later.md']]);
        expect(rows.map(row => row.label)).toEqual(['Heavy 0', 'Later task', 'Heavy 1']);
    });

    it('fails closed when disabled or the GCM task API is unavailable', async () => {
        const list = vi.fn(async () => [task('Notes/one.md', 0, 'One')]);
        const api = { version: 1, list, focus: vi.fn(async () => true) } satisfies GcmTaskApiLike;
        const disabledApp = createApp(api, false).app;
        const provider = new GcmTaskRowProvider();

        expect(await provider.getRows(context(disabledApp, ['Notes/one.md']), { enabled: true })).toEqual([]);
        expect(await provider.getRows(context(createApp(null).app, ['Notes/one.md']), { enabled: true })).toEqual([]);
        expect(await provider.getRows(context(createApp(api).app, ['Notes/one.md']), { enabled: false })).toEqual([]);
        expect(list).not.toHaveBeenCalled();
        expect(resolveGcmTaskApi(disabledApp)).toBeNull();
    });

    it('exposes a disabled-by-default-compatible selection seam for settings wiring', () => {
        expect(createGcmTaskRowProviderSelection({ enabled: false })).toEqual({
            enabledProviderIds: [],
            optionsByProviderId: {
                [GCM_TASK_ROW_PROVIDER_ID]: { enabled: false }
            }
        });
    });
});
