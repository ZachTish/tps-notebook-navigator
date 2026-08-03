/*
 * TPS Notebook Navigator - TPS integration settings regression coverage.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/i18n', () => ({
    strings: {
        common: {
            cancel: 'Cancel',
            delete: 'Delete',
            restoreDefault: 'Restore default'
        }
    }
}));

import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    createTpsIntegrationSettingDefinitions,
    renderTpsResourceCreationTargetSetting,
    renderTpsTypesNavigationEnabledSetting,
    setTpsResourceCreationSpecificFileVisibility,
    setTpsTaskRowSettingVisibility
} from '../../src/settings/tabs/TpsIntegrationTab';
import type { SettingsTabContext } from '../../src/settings/tabs/SettingsTabContext';

function createContext(): SettingsTabContext {
    return {
        plugin: {
            settings: structuredClone(DEFAULT_SETTINGS),
            saveSettingsAndUpdate: vi.fn().mockResolvedValue(undefined)
        },
        refreshSettingsDomState: vi.fn()
    } as unknown as SettingsTabContext;
}

describe('TPS integration settings', () => {
    it('keeps Types and task-row controls flat, ordered, and progressively disclosed', () => {
        const context = createContext();
        const definitions = createTpsIntegrationSettingDefinitions(context) as Array<Record<string, unknown>>;

        expect(definitions).toHaveLength(4);
        expect(definitions.map(group => group.heading)).toEqual(['Types navigation', 'Type item creation', 'Task rows', 'One-way setup']);

        const typeItems = definitions[0].items as Array<Record<string, unknown>>;
        expect(typeItems.map(item => item.name)).toEqual(['Show Types in navigation']);
        expect(typeItems[0].desc).toContain('code blocks');
        expect(typeItems[0].desc).toContain('callouts');
        expect(typeItems[0].desc).toContain('blockquotes');
        expect(typeItems[0].desc).toContain('tables');
        expect(typeItems[0].desc).toContain('web links');
        expect(typeItems[0].aliases).toEqual(expect.arrayContaining(['code blocks', 'callouts', 'blockquotes', 'tables', 'web links']));

        const resourceCreationItems = definitions[1].items as Array<Record<string, unknown>>;
        expect(resourceCreationItems.map(item => item.name)).toEqual(['Create items in', 'Specific note']);
        expect(resourceCreationItems[0].visible).toBeUndefined();
        expect((resourceCreationItems[1].visible as () => boolean)()).toBe(false);
        context.plugin.settings.tpsResourceCreationTarget = 'specific-note';
        expect((resourceCreationItems[1].visible as () => boolean)()).toBe(true);

        const taskItems = definitions[2].items as Array<Record<string, unknown>>;
        expect(taskItems.map(item => item.name)).toEqual(['Show GCM tasks beneath notes', 'Include completed tasks', 'Tasks per note']);
        expect(taskItems[0].visible).toBeUndefined();
        expect((taskItems[1].visible as () => boolean)()).toBe(false);
        expect((taskItems[2].visible as () => boolean)()).toBe(false);

        context.plugin.settings.tpsGcmTaskRowsEnabled = true;
        expect((taskItems[1].visible as () => boolean)()).toBe(true);
        expect((taskItems[2].visible as () => boolean)()).toBe(true);
    });

    it('defaults Types navigation on and optional task rows off', () => {
        expect(DEFAULT_SETTINGS.tpsTypesNavigationEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.tpsResourceCreationTarget).toBe('daily-note');
        expect(DEFAULT_SETTINGS.tpsResourceCreationSpecificFile).toBeNull();
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsIncludeCompleted).toBe(false);
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsPerNote).toBe(5);
    });

    it('persists the creation target and refreshes conditional settings visibility', async () => {
        const context = createContext();
        const saveSettingsAndUpdate = vi.fn().mockResolvedValue(undefined);
        const refreshSettingsDomState = vi.fn();
        context.plugin.saveSettingsAndUpdate = saveSettingsAndUpdate;
        context.refreshSettingsDomState = refreshSettingsDomState;
        let handleChange: ((value: string) => Promise<void>) | undefined;
        const dropdown = {
            addOption: vi.fn().mockReturnThis(),
            setValue: vi.fn().mockReturnThis(),
            onChange: vi.fn((callback: (value: string) => Promise<void>) => {
                handleChange = callback;
                return dropdown;
            })
        };
        const setting = {
            setName: vi.fn().mockReturnThis(),
            setDesc: vi.fn().mockReturnThis(),
            addDropdown: vi.fn((render: (control: typeof dropdown) => void) => {
                render(dropdown);
                return setting;
            })
        };

        renderTpsResourceCreationTargetSetting(setting as never, context);

        expect(dropdown.setValue).toHaveBeenCalledWith('daily-note');
        expect(dropdown.addOption).toHaveBeenCalledWith('daily-note', "Today's daily note");
        expect(dropdown.addOption).toHaveBeenCalledWith('active-note', 'Active note');
        expect(dropdown.addOption).toHaveBeenCalledWith('specific-note', 'Specific note');
        await handleChange?.('specific-note');
        expect(context.plugin.settings.tpsResourceCreationTarget).toBe('specific-note');
        expect(saveSettingsAndUpdate).toHaveBeenCalledOnce();
        expect(refreshSettingsDomState).toHaveBeenCalledOnce();
    });

    it('persists changes to the Types navigation toggle', async () => {
        const saveSettingsAndUpdate = vi.fn().mockResolvedValue(undefined);
        const context = createContext();
        context.plugin.saveSettingsAndUpdate = saveSettingsAndUpdate;
        let handleChange: ((value: boolean) => Promise<void>) | undefined;
        const toggle = {
            setValue: vi.fn().mockReturnThis(),
            onChange: vi.fn((callback: (value: boolean) => Promise<void>) => {
                handleChange = callback;
                return toggle;
            })
        };
        const setting = {
            setName: vi.fn().mockReturnThis(),
            setDesc: vi.fn().mockReturnThis(),
            addToggle: vi.fn((render: (control: typeof toggle) => void) => {
                render(toggle);
                return setting;
            })
        };

        renderTpsTypesNavigationEnabledSetting(setting as never, context);

        expect(toggle.setValue).toHaveBeenCalledWith(true);
        await handleChange?.(false);
        expect(context.plugin.settings.tpsTypesNavigationEnabled).toBe(false);
        expect(saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it('uses the namespaced visibility class for dependent rows in the pre-1.13 renderer', () => {
        const classNames = [new Set<string>(), new Set<string>()];
        const elements = classNames.map(
            classes =>
                ({
                    classList: {
                        toggle: (className: string, force?: boolean) => {
                            const shouldInclude = force ?? !classes.has(className);
                            if (shouldInclude) {
                                classes.add(className);
                            } else {
                                classes.delete(className);
                            }
                            return shouldInclude;
                        }
                    }
                }) as unknown as HTMLElement
        );

        setTpsTaskRowSettingVisibility(elements, false);
        expect(classNames.every(classes => classes.has('tps-nn-setting-hidden'))).toBe(true);

        setTpsTaskRowSettingVisibility(elements, true);
        expect(classNames.every(classes => !classes.has('tps-nn-setting-hidden'))).toBe(true);

        setTpsResourceCreationSpecificFileVisibility(elements[0], false);
        expect(classNames[0]?.has('tps-nn-setting-hidden')).toBe(true);
        setTpsResourceCreationSpecificFileVisibility(elements[0], true);
        expect(classNames[0]?.has('tps-nn-setting-hidden')).toBe(false);
    });
});
