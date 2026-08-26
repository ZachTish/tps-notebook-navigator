import { App, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dailyNoteMocks = vi.hoisted(() => ({
    getConfiguredDailyNoteSettings: vi.fn(),
    createDailyNote: vi.fn()
}));
const momentMocks = vi.hoisted(() => ({
    getMomentApi: vi.fn(),
    resolveDailyNoteLocale: vi.fn(() => 'en')
}));

vi.mock('../../src/utils/dailyNotes', () => dailyNoteMocks);
vi.mock('../../src/utils/moment', () => momentMocks);

import {
    appendMarkdownResource,
    createTpsNavigatorResource,
    getTpsResourceCreationActionLabel,
    isTpsNavigatorCreatableResourceTypeId,
    resolveTpsResourceCreationTarget
} from '../../src/services/types/markdownResourceCreation';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

interface TestAppContext {
    app: App;
    file: TFile;
    getContent(): string;
    process: ReturnType<typeof vi.fn>;
    editor: {
        setCursor: ReturnType<typeof vi.fn>;
        scrollIntoView: ReturnType<typeof vi.fn>;
        focus: ReturnType<typeof vi.fn>;
    };
}

function createTestApp(path = 'Inbox/Target.md', initialContent = '---\ntitle: Keep me\n---\nBody'): TestAppContext {
    const app = new App();
    const file = new TFile(path);
    let content = initialContent;
    const process = vi.fn(async (_file: TFile, update: (current: string) => string) => {
        content = update(content);
    });
    const editor = {
        setCursor: vi.fn(),
        scrollIntoView: vi.fn(),
        focus: vi.fn()
    };
    const leaf = {
        view: { file, editor },
        openFile: vi.fn(async () => undefined)
    };

    registerTestFile(app, file);
    Object.assign(app.vault, { process, cachedRead: vi.fn(async () => content) });
    Object.assign(app, {
        workspace: {
            activeLeaf: leaf,
            getActiveFile: vi.fn(() => file),
            getLeaf: vi.fn(() => leaf),
            getLeavesOfType: vi.fn(() => [leaf])
        }
    });

    return { app, file, getContent: () => content, process, editor };
}

function registerTestFile(app: App, file: TFile): void {
    const vault = app.vault as typeof app.vault & { registerFile(value: TFile): void };
    vault.registerFile(file);
}

function installGcmTaskCreate(app: App, create: ReturnType<typeof vi.fn>): void {
    Object.assign(app, {
        plugins: {
            enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
            getPlugin: vi.fn(() => ({
                api: {
                    tasks: {
                        version: 1,
                        list: vi.fn(),
                        focus: vi.fn(),
                        create
                    }
                }
            }))
        }
    });
}

const SPECIFIC_TARGET = { target: 'specific-note' as const, specificFile: 'Inbox/Target.md' };

describe('TPS Markdown resource creation', () => {
    beforeEach(() => {
        dailyNoteMocks.getConfiguredDailyNoteSettings.mockReset();
        dailyNoteMocks.createDailyNote.mockReset();
        momentMocks.getMomentApi.mockReset();
        momentMocks.resolveDailyNoteLocale.mockClear();
    });

    it('recognizes only the built-in line Types with an implemented create flow', () => {
        const creatable = [
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            TPS_NAVIGATOR_TYPE_IDS.BULLETS,
            TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
            TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
            TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
            TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
            TPS_NAVIGATOR_TYPE_IDS.TABLES,
            TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS
        ];

        creatable.forEach(typeId => expect(isTpsNavigatorCreatableResourceTypeId(typeId)).toBe(true));
        expect(isTpsNavigatorCreatableResourceTypeId(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(false);
        expect(isTpsNavigatorCreatableResourceTypeId(TPS_NAVIGATOR_TYPE_IDS.PDFS)).toBe(false);
        expect(isTpsNavigatorCreatableResourceTypeId('provider:example%2Frelations:projects')).toBe(false);
        expect(getTpsResourceCreationActionLabel(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toBe('New table');
        expect(getTpsResourceCreationActionLabel(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toBe('New web link');
    });

    it('preserves CRLF and calculates an exact cursor without rewriting existing content', () => {
        expect(
            appendMarkdownResource('---\r\ntitle: Keep me\r\n---\r\n', {
                text: '> [!note]\n> ',
                cursorLineOffset: 1,
                cursorColumn: 2
            })
        ).toEqual({
            content: '---\r\ntitle: Keep me\r\n---\r\n> [!note]\r\n> \r\n',
            lineIndex: 4,
            column: 2
        });
    });

    it.each([
        [TPS_NAVIGATOR_TYPE_IDS.BULLETS, '- ', 4, 2],
        [TPS_NAVIGATOR_TYPE_IDS.HEADINGS, '# ', 4, 2],
        [TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, '```\n\n```', 5, 0],
        [TPS_NAVIGATOR_TYPE_IDS.CALLOUTS, '> [!note]\n> ', 5, 2],
        [TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES, '> ', 4, 2],
        [TPS_NAVIGATOR_TYPE_IDS.TABLES, '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |', 6, 2],
        [TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS, '<https://>', 4, 9]
    ] as const)('atomically appends %s and focuses its editable source position', async (typeId, scaffold, cursorLine, cursorColumn) => {
        const context = createTestApp();

        await expect(createTpsNavigatorResource(context.app, typeId, SPECIFIC_TARGET)).resolves.toMatchObject({
            ok: true,
            file: context.file,
            lineNumber: cursorLine + 1
        });

        expect(context.process).toHaveBeenCalledOnce();
        expect(context.getContent()).toBe(`---\ntitle: Keep me\n---\nBody\n${scaffold}\n`);
        expect(context.editor.setCursor).toHaveBeenCalledWith({ line: cursorLine, ch: cursorColumn });
        expect(context.editor.focus).toHaveBeenCalledOnce();
    });

    it('uses the callback body from Vault.process as the mutation authority', async () => {
        const context = createTestApp('Inbox/Target.md', 'Concurrent edit');

        await createTpsNavigatorResource(context.app, TPS_NAVIGATOR_TYPE_IDS.BULLETS, SPECIFIC_TARGET);

        expect(context.getContent()).toBe('Concurrent edit\n- \n');
    });

    it('delegates checkbox creation to GCM with the resolved explicit target and no raw fallback', async () => {
        const context = createTestApp();
        const create = vi.fn().mockResolvedValue({
            ok: true,
            changed: true,
            task: {
                path: context.file.path,
                lineNumber: 4,
                rawLine: '- [ ] Ship release',
                title: 'Ship release',
                checkbox: ' ',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                tags: []
            }
        });
        installGcmTaskCreate(context.app, create);

        await expect(
            createTpsNavigatorResource(context.app, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, SPECIFIC_TARGET, {
                taskTitle: '  Ship   release  ',
                taskTags: ['hca', 'idea'],
                taskFields: { priority: 'high' },
                taskStatus: 'todo'
            })
        ).resolves.toMatchObject({ ok: true, file: context.file, lineNumber: 5 });
        expect(create).toHaveBeenCalledWith({
            title: 'Ship release',
            targetFile: context.file,
            tags: ['hca', 'idea'],
            fields: { priority: 'high' },
            status: 'todo',
            placement: 'end',
            focus: true,
            notice: true
        });
        expect(context.process).not.toHaveBeenCalled();
    });

    it('fails closed when checkbox creation is unavailable instead of inserting an unmapped task', async () => {
        const context = createTestApp();

        await expect(
            createTpsNavigatorResource(context.app, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, SPECIFIC_TARGET, {
                taskTitle: 'Do it'
            })
        ).resolves.toMatchObject({ ok: false, reason: 'gcm-task-api-unavailable' });
        expect(context.process).not.toHaveBeenCalled();
    });

    it('validates checkbox creation before resolving or creating the configured daily note', async () => {
        const context = createTestApp();

        await expect(
            createTpsNavigatorResource(
                context.app,
                TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                { target: 'daily-note', specificFile: null },
                { taskTitle: '   ' }
            )
        ).resolves.toMatchObject({ ok: false, reason: 'invalid-task-title' });
        expect(dailyNoteMocks.getConfiguredDailyNoteSettings).not.toHaveBeenCalled();
        expect(dailyNoteMocks.createDailyNote).not.toHaveBeenCalled();
    });

    it('reports thrown GCM and Vault.process mutations as write failures', async () => {
        const taskContext = createTestApp();
        installGcmTaskCreate(taskContext.app, vi.fn().mockRejectedValue(new Error('GCM unavailable')));
        await expect(
            createTpsNavigatorResource(taskContext.app, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, SPECIFIC_TARGET, {
                taskTitle: 'Ship release'
            })
        ).resolves.toMatchObject({ ok: false, reason: 'write-failed' });

        const bulletContext = createTestApp();
        Object.assign(bulletContext.app.vault, { process: vi.fn().mockRejectedValue(new Error('write failed')) });
        await expect(createTpsNavigatorResource(bulletContext.app, TPS_NAVIGATOR_TYPE_IDS.BULLETS, SPECIFIC_TARGET)).resolves.toMatchObject(
            { ok: false, reason: 'write-failed' }
        );
        expect(bulletContext.editor.setCursor).not.toHaveBeenCalled();
    });

    it('resolves the active Markdown note and rejects non-Markdown active files', async () => {
        const context = createTestApp();
        await expect(resolveTpsResourceCreationTarget(context.app, { target: 'active-note', specificFile: null })).resolves.toBe(
            context.file
        );

        const canvas = new TFile('Board.canvas');
        Object.assign(context.app.workspace, { getActiveFile: vi.fn(() => canvas) });
        await expect(resolveTpsResourceCreationTarget(context.app, { target: 'active-note', specificFile: null })).resolves.toMatchObject({
            ok: false,
            reason: 'active-note-unavailable'
        });
    });

    it('rejects missing and Excalidraw specific-note targets', async () => {
        const context = createTestApp();
        await expect(
            resolveTpsResourceCreationTarget(context.app, { target: 'specific-note', specificFile: 'Missing.md' })
        ).resolves.toMatchObject({ ok: false, reason: 'specific-note-unavailable' });

        const drawing = new TFile('Drawing.excalidraw.md');
        registerTestFile(context.app, drawing);
        await expect(
            resolveTpsResourceCreationTarget(context.app, { target: 'specific-note', specificFile: drawing.path })
        ).resolves.toMatchObject({ ok: false, reason: 'specific-note-unavailable' });

        const renamedDrawing = new TFile('Renamed drawing.md');
        registerTestFile(context.app, renamedDrawing);
        Object.assign(context.app.metadataCache, {
            getFileCache: vi.fn((file: TFile) =>
                file.path === renamedDrawing.path ? { frontmatter: { 'excalidraw-plugin': 'parsed' } } : null
            )
        });
        await expect(
            resolveTpsResourceCreationTarget(context.app, { target: 'specific-note', specificFile: renamedDrawing.path })
        ).resolves.toMatchObject({ ok: false, reason: 'specific-note-unavailable' });

        const uncachedDrawing = createTestApp('Renamed uncached drawing.md', '---\nexcalidraw-plugin: parsed\n---\nDrawing data');
        await expect(
            resolveTpsResourceCreationTarget(uncachedDrawing.app, {
                target: 'specific-note',
                specificFile: uncachedDrawing.file.path
            })
        ).resolves.toMatchObject({ ok: false, reason: 'specific-note-unavailable' });
        expect(uncachedDrawing.process).not.toHaveBeenCalled();
    });

    it('revalidates the freshest process body before appending', async () => {
        const context = createTestApp('Inbox/Target.md', 'Ordinary note');
        Object.assign(context.app.vault, {
            process: vi.fn(async (_file: TFile, update: (current: string) => string) => {
                update('---\nexcalidraw-plugin: parsed\n---\nDrawing data');
            })
        });

        await expect(createTpsNavigatorResource(context.app, TPS_NAVIGATOR_TYPE_IDS.BULLETS, SPECIFIC_TARGET)).resolves.toMatchObject({
            ok: false,
            reason: 'write-failed'
        });
        expect(context.editor.setCursor).not.toHaveBeenCalled();
    });

    it("creates and returns today's daily note when the default target is configured", async () => {
        const context = createTestApp('Daily/2026-08-03.md', '');
        const today = { locale: vi.fn().mockReturnThis() };
        const momentApi = vi.fn(() => today);
        dailyNoteMocks.getConfiguredDailyNoteSettings.mockResolvedValue({ folder: 'Daily', format: 'YYYY-MM-DD', template: '' });
        dailyNoteMocks.createDailyNote.mockResolvedValue(context.file);
        momentMocks.getMomentApi.mockReturnValue(momentApi);

        await expect(resolveTpsResourceCreationTarget(context.app, { target: 'daily-note', specificFile: null })).resolves.toBe(
            context.file
        );
        expect(today.locale).toHaveBeenCalledWith('en');
        expect(dailyNoteMocks.createDailyNote).toHaveBeenCalledWith(context.app, today);
    });

    it("creates a resource in today's newly resolved blank daily note", async () => {
        const context = createTestApp('Daily/2026-08-03.md', '');
        const today = { locale: vi.fn().mockReturnThis() };
        dailyNoteMocks.getConfiguredDailyNoteSettings.mockResolvedValue({ folder: 'Daily', format: 'YYYY-MM-DD', template: '' });
        dailyNoteMocks.createDailyNote.mockResolvedValue(context.file);
        momentMocks.getMomentApi.mockReturnValue(vi.fn(() => today));

        await expect(
            createTpsNavigatorResource(context.app, TPS_NAVIGATOR_TYPE_IDS.BULLETS, {
                target: 'daily-note',
                specificFile: null
            })
        ).resolves.toMatchObject({ ok: true, file: context.file, lineNumber: 1 });
        expect(context.getContent()).toBe('- \n');
        expect(context.editor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 2 });
    });

    it('keeps external provider collections non-creatable', async () => {
        const context = createTestApp();
        await expect(
            createTpsNavigatorResource(context.app, 'provider:example%2Frelations:projects', SPECIFIC_TARGET)
        ).resolves.toMatchObject({ ok: false, reason: 'unsupported-type' });
        expect(context.process).not.toHaveBeenCalled();
    });
});
