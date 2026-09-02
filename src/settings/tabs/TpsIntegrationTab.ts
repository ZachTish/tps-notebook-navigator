/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Setting, SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { createGroupDefinition, createRenderDefinition } from '../nativeSettingControls';
import { setElementVisible } from '../dependentSettings';
import type { SettingsTabContext } from './SettingsTabContext';
import { showNotice } from '../../utils/noticeUtils';
import { renderSliderSetting } from './SliderSetting';
import { FilePathInputSuggest } from '../../suggest/FilePathInputSuggest';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';
import { normalizeOptionalVaultFilePath } from '../../utils/pathUtils';
import {
    TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT,
    TPS_GCM_TASK_ROWS_PER_NOTE_MAX,
    TPS_GCM_TASK_ROWS_PER_NOTE_MIN,
    isTpsDataArchitectureMode,
    isTpsResourceCreationTarget
} from '../types';

export const TPS_INTEGRATION_SETTINGS_LABEL = 'TPS integration';
export const TPS_INTEGRATION_SETTINGS_DESCRIPTION =
    'Connect optional TPS features and move settings into this fork without coupling it to the original plugin.';

const UPSTREAM_IMPORT_COPY = {
    group: 'One-way setup',
    name: 'Import upstream Notebook Navigator settings',
    desc: "Copy recognized settings from the original plugin's data.json into TPS Notebook Navigator. The original plugin and its data remain unchanged.",
    button: 'Import upstream settings',
    confirmTitle: 'Import upstream Notebook Navigator settings?',
    confirmMessage:
        "This reads only the original plugin's data.json and copies matching settings into TPS Notebook Navigator. Existing TPS values omitted by the upstream file are kept. The original plugin is never changed.",
    confirmButton: 'Import settings',
    success: 'Upstream Notebook Navigator settings imported into TPS Notebook Navigator.',
    missing: 'No upstream Notebook Navigator settings file was found.',
    failed: 'Could not import upstream Notebook Navigator settings: {message}'
} as const;

const TYPES_NAVIGATION_COPY = {
    group: 'Types collections (paused)',
    name: 'Enable Types collections (experimental)',
    desc: 'Off keeps the navigator note/file-focused and stops exact-line, Markdown-structure, and Web-link Types indexing. Note task-progress bars and counts remain available while Types are off.'
} as const;

const RESOURCE_CREATION_COPY = {
    group: 'Type item creation',
    targetName: 'Create items in',
    targetDesc: 'Choose which Markdown note receives new checkboxes, bullets, headings, and other source-backed Types.',
    targetOptions: {
        'daily-note': "Today's daily note",
        'active-note': 'Active note',
        'specific-note': 'Specific note'
    },
    fileName: 'Specific note',
    fileDesc: 'Choose the existing Markdown note used when the creation target is Specific note.',
    filePlaceholder: 'Folder/Note.md'
} as const;

const TASK_ROWS_COPY = {
    group: 'Task rows',
    enabledName: 'Show GCM tasks beneath notes',
    enabledDesc:
        'Optionally add individual GCM task rows beneath notes. This is separate from note task-progress bars and counts, which remain available when attached rows are off.',
    includeCompletedName: 'Include completed tasks',
    includeCompletedDesc: 'Also show checked tasks beneath their note.',
    limitName: 'Tasks per note',
    limitDesc: 'Limit the task rows shown beneath each note.'
} as const;

const DATA_ARCHITECTURE_COPY = {
    group: 'Data architecture',
    name: 'TPS data architecture',
    desc: 'Native records keeps Navigator file-only: it disables virtual line rows and companion-property writes while preserving ordinary file navigation, multi-select, previews, tags, and typed Markdown property drops.',
    options: {
        legacy: 'Legacy integrations',
        'native-records': 'Native Markdown records'
    }
} as const;

/** Builds native settings definitions for the fork-specific TPS integration destination. */
export function createTpsIntegrationSettingDefinitions(context: SettingsTabContext): SettingDefinitionItem[] {
    const architectureItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: DATA_ARCHITECTURE_COPY.name,
            desc: DATA_ARCHITECTURE_COPY.desc,
            aliases: ['native records', 'real files', 'disable virtual rows'],
            render: setting => renderTpsDataArchitectureSetting(setting, context)
        })
    ];
    const typeItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: TYPES_NAVIGATION_COPY.name,
            desc: TYPES_NAVIGATION_COPY.desc,
            aliases: [
                'Types section',
                'file types',
                'checkboxes',
                'bullets',
                'headings',
                'code blocks',
                'callouts',
                'blockquotes',
                'tables',
                'web links'
            ],
            render: setting => renderTpsTypesNavigationEnabledSetting(setting, context)
        })
    ];
    const taskItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: TASK_ROWS_COPY.enabledName,
            desc: TASK_ROWS_COPY.enabledDesc,
            aliases: ['GCM task rows', 'render tasks', 'navigator tasks'],
            render: setting => renderGcmTaskRowsEnabledSetting(setting, context)
        }),
        createRenderDefinition({
            name: TASK_ROWS_COPY.includeCompletedName,
            desc: TASK_ROWS_COPY.includeCompletedDesc,
            visible: () => context.plugin.settings.tpsGcmTaskRowsEnabled,
            render: setting => renderGcmTaskRowsIncludeCompletedSetting(setting, context)
        }),
        createRenderDefinition({
            name: TASK_ROWS_COPY.limitName,
            desc: TASK_ROWS_COPY.limitDesc,
            visible: () => context.plugin.settings.tpsGcmTaskRowsEnabled,
            render: setting => renderGcmTaskRowsPerNoteSetting(setting, context)
        })
    ];
    const resourceCreationItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: RESOURCE_CREATION_COPY.targetName,
            desc: RESOURCE_CREATION_COPY.targetDesc,
            aliases: Object.values(RESOURCE_CREATION_COPY.targetOptions),
            render: setting => renderTpsResourceCreationTargetSetting(setting, context)
        }),
        createRenderDefinition({
            name: RESOURCE_CREATION_COPY.fileName,
            desc: RESOURCE_CREATION_COPY.fileDesc,
            aliases: [RESOURCE_CREATION_COPY.filePlaceholder, 'creation note'],
            visible: () => context.plugin.settings.tpsResourceCreationTarget === 'specific-note',
            render: setting => renderTpsResourceCreationSpecificFileSetting(setting, context)
        })
    ];
    const setupItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: UPSTREAM_IMPORT_COPY.name,
            desc: UPSTREAM_IMPORT_COPY.desc,
            aliases: [UPSTREAM_IMPORT_COPY.button, 'Notebook Navigator import'],
            render: setting => renderUpstreamSettingsImportSetting(setting, context)
        })
    ];

    return [
        createGroupDefinition(DATA_ARCHITECTURE_COPY.group, architectureItems),
        createGroupDefinition(TYPES_NAVIGATION_COPY.group, typeItems),
        createGroupDefinition(RESOURCE_CREATION_COPY.group, resourceCreationItems, {
            visible: () => context.plugin.settings.tpsTypesNavigationEnabled
        }),
        createGroupDefinition(TASK_ROWS_COPY.group, taskItems),
        createGroupDefinition(UPSTREAM_IMPORT_COPY.group, setupItems)
    ];
}

export function renderTpsDataArchitectureSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;
    setting
        .setName(DATA_ARCHITECTURE_COPY.name)
        .setDesc(DATA_ARCHITECTURE_COPY.desc)
        .addDropdown(dropdown => {
            Object.entries(DATA_ARCHITECTURE_COPY.options).forEach(([value, label]) => {
                dropdown.addOption(value, label);
            });
            dropdown.setValue(plugin.settings.tpsDataArchitectureMode).onChange(async value => {
                if (!isTpsDataArchitectureMode(value)) return;
                plugin.settings.tpsDataArchitectureMode = value;
                if (value === 'native-records') {
                    plugin.settings.tpsTypesNavigationEnabled = false;
                    plugin.settings.tpsGcmTaskRowsEnabled = false;
                }
                await plugin.saveSettingsAndUpdate();
                context.refreshSettingsDomState();
            });
        });
}

/** Shared renderer for the source-backed Type creation target. */
export function renderTpsResourceCreationTargetSetting(setting: Setting, context: SettingsTabContext, onAfterUpdate?: () => void): void {
    const { plugin } = context;
    setting
        .setName(RESOURCE_CREATION_COPY.targetName)
        .setDesc(RESOURCE_CREATION_COPY.targetDesc)
        .addDropdown(dropdown => {
            Object.entries(RESOURCE_CREATION_COPY.targetOptions).forEach(([value, label]) => {
                dropdown.addOption(value, label);
            });
            dropdown.setValue(plugin.settings.tpsResourceCreationTarget).onChange(async value => {
                if (!isTpsResourceCreationTarget(value)) {
                    return;
                }
                plugin.settings.tpsResourceCreationTarget = value;
                await plugin.saveSettingsAndUpdate();
                context.refreshSettingsDomState();
                onAfterUpdate?.();
            });
        });
}

/** Shared renderer for the conditional specific-note creation target. */
export function renderTpsResourceCreationSpecificFileSetting(setting: Setting, context: SettingsTabContext): void {
    const { app, plugin } = context;
    context.configureDebouncedTextSetting(
        setting,
        RESOURCE_CREATION_COPY.fileName,
        RESOURCE_CREATION_COPY.fileDesc,
        RESOURCE_CREATION_COPY.filePlaceholder,
        () => plugin.settings.tpsResourceCreationSpecificFile ?? '',
        value => {
            plugin.settings.tpsResourceCreationSpecificFile = normalizeOptionalVaultFilePath(value);
        }
    );
    setting.controlEl.addClass('nn-setting-wide-input');
    const inputEl = setting.controlEl.querySelector<HTMLInputElement>('input');
    if (!inputEl) {
        return;
    }
    const suggest = new FilePathInputSuggest(app, inputEl, {
        includeFile: file => {
            const cache = app.metadataCache.getFileCache(file);
            return (
                file.extension.toLocaleLowerCase() === 'md' &&
                !isExcalidrawFile(file) &&
                cache !== null &&
                !hasExcalidrawFrontmatterFlagValue(cache.frontmatter)
            );
        }
    });
    inputEl.addEventListener('click', () => {
        suggest.open();
    });
    context.registerSettingsRenderCleanup(() => suggest.close());
}

/** Applies the namespaced visibility class used by the legacy specific-note row. */
export function setTpsResourceCreationSpecificFileVisibility(element: HTMLElement | null, visible: boolean): void {
    if (element) {
        setElementVisible(element, visible);
    }
}

/** Applies progressive disclosure to the legacy Type-creation group. */
export function setTpsTypeCreationSettingVisibility(element: HTMLElement | null, visible: boolean): void {
    if (element) {
        setElementVisible(element, visible);
    }
}

/** Shared renderer for the Types-navigation enable control. */
export function renderTpsTypesNavigationEnabledSetting(setting: Setting, context: SettingsTabContext, onAfterUpdate?: () => void): void {
    const { plugin } = context;
    setting
        .setName(TYPES_NAVIGATION_COPY.name)
        .setDesc(TYPES_NAVIGATION_COPY.desc)
        .addToggle(toggle =>
            toggle
                .setDisabled(plugin.settings.tpsDataArchitectureMode === 'native-records')
                .setValue(plugin.settings.tpsTypesNavigationEnabled)
                .onChange(async value => {
                    if (plugin.settings.tpsDataArchitectureMode === 'native-records') return;
                    plugin.settings.tpsTypesNavigationEnabled = value;
                    await plugin.saveSettingsAndUpdate();
                    context.refreshSettingsDomState();
                    onAfterUpdate?.();
                })
        );
}

/** Shared renderer for the task-row enable control. */
export function renderGcmTaskRowsEnabledSetting(setting: Setting, context: SettingsTabContext, onAfterUpdate?: () => void): void {
    const { plugin } = context;
    setting
        .setName(TASK_ROWS_COPY.enabledName)
        .setDesc(TASK_ROWS_COPY.enabledDesc)
        .addToggle(toggle =>
            toggle
                .setDisabled(plugin.settings.tpsDataArchitectureMode === 'native-records')
                .setValue(plugin.settings.tpsGcmTaskRowsEnabled)
                .onChange(async value => {
                    if (plugin.settings.tpsDataArchitectureMode === 'native-records') return;
                    plugin.settings.tpsGcmTaskRowsEnabled = value;
                    await plugin.saveSettingsAndUpdate();
                    context.refreshSettingsDomState();
                    onAfterUpdate?.();
                })
        );
}

/** Shared renderer for completed-task visibility. */
export function renderGcmTaskRowsIncludeCompletedSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;
    setting
        .setName(TASK_ROWS_COPY.includeCompletedName)
        .setDesc(TASK_ROWS_COPY.includeCompletedDesc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.tpsGcmTaskRowsIncludeCompleted).onChange(async value => {
                plugin.settings.tpsGcmTaskRowsIncludeCompleted = value;
                await plugin.saveSettingsAndUpdate();
            })
        );
}

/** Shared renderer for the per-note task-row limit. */
export function renderGcmTaskRowsPerNoteSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;
    renderSliderSetting(setting, {
        name: TASK_ROWS_COPY.limitName,
        desc: TASK_ROWS_COPY.limitDesc,
        value: plugin.settings.tpsGcmTaskRowsPerNote,
        defaultValue: TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT,
        min: TPS_GCM_TASK_ROWS_PER_NOTE_MIN,
        max: TPS_GCM_TASK_ROWS_PER_NOTE_MAX,
        step: 1,
        onChange: async value => {
            plugin.settings.tpsGcmTaskRowsPerNote = value;
            await plugin.saveSettingsAndUpdate();
        }
    });
}

/** Applies the namespaced visibility class used by legacy dependent settings. */
export function setTpsTaskRowSettingVisibility(settingElements: readonly (HTMLElement | null)[], visible: boolean): void {
    settingElements.forEach(element => {
        if (element) {
            setElementVisible(element, visible);
        }
    });
}

/** Shared row renderer used by both native settings pages and the legacy settings fallback. */
export function renderUpstreamSettingsImportSetting(setting: Setting, context: SettingsTabContext): void {
    const { app, plugin } = context;

    setting
        .setName(UPSTREAM_IMPORT_COPY.name)
        .setDesc(UPSTREAM_IMPORT_COPY.desc)
        .addButton(button => {
            button.setButtonText(UPSTREAM_IMPORT_COPY.button);
            button.onClick(() => {
                new ConfirmModal(
                    app,
                    UPSTREAM_IMPORT_COPY.confirmTitle,
                    UPSTREAM_IMPORT_COPY.confirmMessage,
                    async () => {
                        button.setDisabled(true);
                        try {
                            const result = await plugin.importUpstreamNotebookNavigatorSettings();
                            if (result === 'missing') {
                                showNotice(UPSTREAM_IMPORT_COPY.missing, { variant: 'warning' });
                                return;
                            }
                            showNotice(UPSTREAM_IMPORT_COPY.success, { variant: 'success' });
                        } catch (error) {
                            console.error('[TPS Notebook Navigator] Upstream settings import failed', error);
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            showNotice(UPSTREAM_IMPORT_COPY.failed.replace('{message}', message), { variant: 'warning' });
                        } finally {
                            button.setDisabled(false);
                        }
                    },
                    UPSTREAM_IMPORT_COPY.confirmButton,
                    { confirmButtonClass: 'mod-cta' }
                ).open();
            });
        });
}
