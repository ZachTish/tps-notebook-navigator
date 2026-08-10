import { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    createDailyNote,
    getConfiguredDailyNoteSettings,
    getConfiguredDailyNoteTemplatePath,
    type DailyNoteSettings
} from '../../src/utils/dailyNotes';
import type { MomentInstance } from '../../src/utils/moment';

const SETTINGS: DailyNoteSettings = {
    folder: '',
    format: 'YYYY-MM-DD',
    template: 'Templates/Daily'
};

function createDate(): MomentInstance {
    return {
        format: vi.fn(() => '2026-08-03')
    } as unknown as MomentInstance;
}

describe('daily note template safety', () => {
    it('recovers a saved template while Core Daily Notes still exposes startup defaults', async () => {
        const app = new App();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD', template: '' } }
                }))
            }
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ folder: 'Persisted/Daily', format: 'YYYY/YYYYMMDD', template: 'Templates/Daily' }))
        });
        Object.assign(app.vault, { configDir: ['.ob', 'sidian'].join('') });

        await expect(getConfiguredDailyNoteTemplatePath(app)).resolves.toBe('Templates/Daily');
        await expect(getConfiguredDailyNoteSettings(app)).resolves.toEqual({
            folder: 'Persisted/Daily',
            format: 'YYYY/YYYYMMDD',
            template: 'Templates/Daily'
        });
    });

    it('does not inherit stale Daily Notes settings when the Core plugin is disabled', async () => {
        const app = new App();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: false,
                    instance: { options: { template: '' } }
                }))
            }
        });
        const read = vi.fn(async () => JSON.stringify({ template: 'Templates/Stale' }));
        Object.assign(app.vault.adapter, { read });

        await expect(getConfiguredDailyNoteTemplatePath(app)).resolves.toBeNull();
        expect(read).not.toHaveBeenCalled();
    });

    it('creates with the persisted folder that owns a recovered startup template', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('Persisted/Daily/2026-08-03.md');
        const create = vi.fn(async () => created);
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD', template: '' } }
                }))
            }
        });
        Object.assign(app.vault, {
            configDir: ['.ob', 'sidian'].join(''),
            create,
            createFolder: vi.fn(async () => undefined),
            cachedRead: vi.fn(async () => '# Daily template\n')
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ folder: 'Persisted/Daily', format: 'YYYY-MM-DD', template: 'Templates/Daily' }))
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        await expect(createDailyNote(app, createDate(), { folder: '', format: 'YYYY-MM-DD', template: '' })).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('Persisted/Daily/2026-08-03.md', '# Daily template\n');
    });

    it('fails closed when a configured template cannot be resolved', async () => {
        const app = new App();
        const create = vi.fn();
        Object.assign(app.vault, { create });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => null) });

        await expect(createDailyNote(app, createDate(), SETTINGS)).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('reads and inserts a configured template before returning the created daily note', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        const cachedRead = vi.fn(async (file: TFile) => (file.path === template.path ? '# Daily template\n' : ''));
        Object.assign(app.vault, { create, cachedRead });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        await expect(createDailyNote(app, createDate(), SETTINGS)).resolves.toBe(created);
        expect(cachedRead).toHaveBeenCalledWith(template);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '# Daily template\n');
    });

    it('still creates from a readable template when optional fold-state loading fails', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        Object.assign(app.vault, { create, cachedRead: vi.fn(async () => '# Daily template\n') });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, {
            foldManager: {
                load: vi.fn(() => {
                    throw new Error('fold store unavailable');
                }),
                save: vi.fn()
            }
        });

        await expect(createDailyNote(app, createDate(), SETTINGS)).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '# Daily template\n');
    });

    it('creates a blank daily note when no template is configured', async () => {
        const app = new App();
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        const cachedRead = vi.fn();
        Object.assign(app.vault, { create, cachedRead });

        await expect(createDailyNote(app, createDate(), { ...SETTINGS, template: '' })).resolves.toBe(created);
        expect(cachedRead).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '');
    });
});
