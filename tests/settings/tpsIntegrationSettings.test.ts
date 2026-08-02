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
    renderTpsTypesNavigationEnabledSetting,
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

        expect(definitions).toHaveLength(3);
        expect(definitions.map(group => group.heading)).toEqual(['Types navigation', 'Task rows', 'One-way setup']);

        const typeItems = definitions[0].items as Array<Record<string, unknown>>;
        expect(typeItems.map(item => item.name)).toEqual(['Show Types in navigation']);
        expect(typeItems[0].desc).toContain('code blocks');
        expect(typeItems[0].desc).toContain('callouts');
        expect(typeItems[0].desc).toContain('blockquotes');
        expect(typeItems[0].desc).toContain('tables');
        expect(typeItems[0].aliases).toEqual(expect.arrayContaining(['code blocks', 'callouts', 'blockquotes', 'tables']));

        const taskItems = definitions[1].items as Array<Record<string, unknown>>;
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
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsIncludeCompleted).toBe(false);
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsPerNote).toBe(5);
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
    });
});
