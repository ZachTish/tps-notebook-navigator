/* TPS Notebook Navigator - built-in and external provider composition contract. */

import type { App, MenuItem } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    createGcmTaskRowProviderSelection,
    GCM_TASK_ROW_PROVIDER_ID,
    GcmTaskRowProvider
} from '../../src/integrations/gcm/GcmTaskRowProvider';
import type { GcmTaskApiLike, GcmTaskLinesApiLike, GcmTaskRecordLike } from '../../src/integrations/gcm/gcmTaskApi';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';
import { composeProviderRows } from '../../src/services/rows/composeProviderRows';
import { buildStandaloneProviderListItems, mergeProviderRowsIntoList } from '../../src/services/rows/providerListItems';
import { mergeNavigatorRowProviderSelections } from '../../src/services/rows/providerSelections';
import type { NavigatorRowContextMenuContext } from '../../src/services/rows/types';
import { ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { createTestTFile } from '../utils/createTestTFile';

const SOURCE_PATH = 'Notes/one.md';
const EXTERNAL_PROVIDER_ID = 'example/actions';

function createApp(api: GcmTaskApiLike, taskLines?: GcmTaskLinesApiLike): App {
    const plugin = { api: { tasks: api, ...(taskLines ? { taskLines } : {}) } };
    return {
        vault: {
            getFileByPath: vi.fn((path: string) => ({ path, extension: 'md' }))
        },
        plugins: {
            enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
            getPlugin: vi.fn(() => plugin),
            plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: plugin }
        }
    } as unknown as App;
}

function task(): GcmTaskRecordLike {
    return {
        path: SOURCE_PATH,
        lineNumber: 4,
        rawLine: '- [ ] Review navigator',
        title: 'Review navigator',
        checkbox: '[ ]',
        marker: ' ',
        status: 'todo',
        isComplete: false,
        tags: []
    };
}

describe('built-in and external row provider composition', () => {
    it('streams the external row, then preserves built-in-first behavior and both providers actions beneath one file', async () => {
        let resolveList: ((records: GcmTaskRecordLike[]) => void) | null = null;
        const list = vi.fn(
            () =>
                new Promise<GcmTaskRecordLike[]>(resolve => {
                    resolveList = resolve;
                })
        );
        const focus = vi.fn(async () => true);
        const setCompletion = vi.fn(async () => ({
            ok: true,
            changed: true,
            task: { ...task(), marker: 'x', checkbox: '[x]', status: 'complete', isComplete: true }
        }));
        const addTaskMenuItems = vi.fn<GcmTaskLinesApiLike['addMenuItems']>();
        const app = createApp(
            { version: 1, list, focus, setCompletion, parseLine: vi.fn(() => task()) },
            { version: 1, addMenuItems: addTaskMenuItems }
        );
        const contextMenu = vi.fn((_context: NavigatorRowContextMenuContext) => undefined);
        const registry = new NavigatorRowProviderRegistry();
        registry.register(new GcmTaskRowProvider());
        registry.register({
            id: EXTERNAL_PROVIDER_ID,
            getRows: async () => [
                {
                    id: 'open-related',
                    kind: 'example/action',
                    label: 'Open related record',
                    sourcePath: SOURCE_PATH,
                    contextMenu
                }
            ]
        });
        const selection = mergeNavigatorRowProviderSelections(
            createGcmTaskRowProviderSelection({ enabled: true, includeCompleted: false, maxRowsPerFile: 10 }),
            { enabledProviderIds: [EXTERNAL_PROVIDER_ID] }
        );
        const snapshots: string[][] = [];

        const resultPromise = composeProviderRows({
            registry,
            context: {
                app,
                scope: {
                    visibleFilePaths: [SOURCE_PATH],
                    selectionType: null,
                    selectedFolderPath: null,
                    selectedTag: null,
                    selectedProperty: null,
                    selectedType: null
                }
            },
            selection,
            onSnapshot: snapshot => snapshots.push(snapshot.rows.map(row => row.providerId))
        });

        await vi.waitFor(() => expect(snapshots).toEqual([[EXTERNAL_PROVIDER_ID]]));
        resolveList?.([task()]);
        const rows = await resultPromise;

        expect(snapshots).toEqual([[EXTERNAL_PROVIDER_ID], [GCM_TASK_ROW_PROVIDER_ID, EXTERNAL_PROVIDER_ID]]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            providerId: GCM_TASK_ROW_PROVIDER_ID,
            sourcePath: SOURCE_PATH,
            sourceLineNumber: 4,
            indicator: { type: 'checkbox', checked: false }
        });
        expect(rows[0]?.contextMenu).toBeTypeOf('function');
        expect(rows[1]).toMatchObject({
            providerId: EXTERNAL_PROVIDER_ID,
            sourcePath: SOURCE_PATH,
            contextMenu
        });

        await rows[0]?.activate?.();
        await rows[0]?.indicator?.onChange?.(true);
        expect(focus).toHaveBeenCalledWith({
            path: SOURCE_PATH,
            lineNumber: 4,
            rawLine: '- [ ] Review navigator',
            title: 'Review navigator'
        });
        expect(setCompletion).toHaveBeenCalledWith(expect.objectContaining({ path: SOURCE_PATH, lineNumber: 4 }), true);

        const taskContext = {
            providerId: GCM_TASK_ROW_PROVIDER_ID,
            rowId: `${SOURCE_PATH}:4`,
            kind: 'tps/gcm-task',
            sourcePath: SOURCE_PATH,
            sourceLineNumber: 4,
            addItem: vi.fn((_configure: (item: MenuItem) => void) => undefined),
            addSeparator: vi.fn(() => undefined)
        };
        rows[0]?.contextMenu?.(taskContext);
        expect(addTaskMenuItems).toHaveBeenCalledOnce();
        const taskMenuCall = addTaskMenuItems.mock.calls[0];
        const configureTaskItem = vi.fn();
        taskMenuCall?.[0].addItem(configureTaskItem);
        taskMenuCall?.[0].addSeparator();
        expect(taskContext.addItem).toHaveBeenCalledWith(configureTaskItem);
        expect(taskContext.addSeparator).toHaveBeenCalledOnce();
        expect(taskMenuCall?.[1]).toMatchObject({ file: { path: SOURCE_PATH }, lineNumber: 5, lineIndex: 4 });
        expect(taskMenuCall?.[2]).toEqual({ includeTags: true });

        const externalContext = {
            providerId: EXTERNAL_PROVIDER_ID,
            rowId: 'open-related',
            kind: 'example/action',
            sourcePath: SOURCE_PATH,
            addItem: vi.fn((_configure: (item: MenuItem) => void) => undefined),
            addSeparator: vi.fn(() => undefined)
        };
        rows[1]?.contextMenu?.(externalContext);
        expect(contextMenu).toHaveBeenCalledWith(externalContext);

        const file = createTestTFile(SOURCE_PATH);
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.FILE, data: file, key: 'file' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const merged = mergeProviderRowsIntoList(listItems, rows);
        expect(merged.map(item => item.key)).toEqual([
            'file',
            `provider:${GCM_TASK_ROW_PROVIDER_ID}:${SOURCE_PATH}:4`,
            `provider:${EXTERNAL_PROVIDER_ID}:open-related`,
            'bottom'
        ]);
    });

    it('keeps native Type rows standalone and queries only Type-capable external providers', async () => {
        const list = vi.fn(async () => [task()]);
        const app = createApp({ version: 1, list, focus: vi.fn(async () => true) });
        const externalGetRows = vi.fn(async () => [
            {
                id: 'related',
                kind: 'example/related',
                label: 'Related record',
                sourcePath: SOURCE_PATH
            }
        ]);
        const registry = new NavigatorRowProviderRegistry();
        registry.register(new GcmTaskRowProvider());
        registry.register({ id: EXTERNAL_PROVIDER_ID, supportsTypeScope: true, getRows: externalGetRows });
        const selection = mergeNavigatorRowProviderSelections(
            createGcmTaskRowProviderSelection({ enabled: true, includeCompleted: false, maxRowsPerFile: 10 }),
            { enabledProviderIds: [EXTERNAL_PROVIDER_ID] }
        );
        const typeContext = {
            app,
            scope: {
                visibleFilePaths: [SOURCE_PATH],
                selectionType: 'type',
                selectedFolderPath: null,
                selectedTag: null,
                selectedProperty: null,
                selectedType: 'structural:task'
            }
        } as const;

        const contributedRows = await composeProviderRows({ registry, context: typeContext, selection });
        const nativeTypeRow = {
            providerId: 'tps/entity-types',
            id: 'structural:task:block:one',
            kind: 'tps/entity-type/task',
            label: 'Review navigator',
            sourcePath: SOURCE_PATH,
            sourceLineNumber: 4
        };
        const listItems = buildStandaloneProviderListItems([nativeTypeRow, ...contributedRows]);

        expect(list).not.toHaveBeenCalled();
        expect(externalGetRows).toHaveBeenCalledWith(typeContext, {});
        expect(listItems.map(item => item.key)).toEqual([
            'top-spacer',
            'provider:tps/entity-types:structural:task:block:one',
            `provider:${EXTERNAL_PROVIDER_ID}:related`,
            'bottom-spacer'
        ]);
    });
});
