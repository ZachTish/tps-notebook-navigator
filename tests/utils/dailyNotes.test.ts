import { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { createDailyNote, type DailyNoteSettings } from '../../src/utils/dailyNotes';
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
