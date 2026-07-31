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
import { TPS_GCM_TASK_ROWS_PER_NOTE_DEFAULT, TPS_GCM_TASK_ROWS_PER_NOTE_MAX, TPS_GCM_TASK_ROWS_PER_NOTE_MIN } from '../types';

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

const TASK_ROWS_COPY = {
    group: 'Task rows',
    enabledName: 'Show GCM tasks beneath notes',
    enabledDesc:
        'Show task rows for exactly the notes in the current file list. Current GCM builds also let the checkbox complete or reopen a task; if GCM is unavailable, the list stays file-only.',
    includeCompletedName: 'Include completed tasks',
    includeCompletedDesc: 'Also show checked tasks beneath their note.',
    limitName: 'Tasks per note',
    limitDesc: 'Limit the task rows shown beneath each note.'
} as const;

/** Builds native settings definitions for the fork-specific TPS integration destination. */
export function createTpsIntegrationSettingDefinitions(context: SettingsTabContext): SettingDefinitionItem[] {
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
    const setupItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: UPSTREAM_IMPORT_COPY.name,
            desc: UPSTREAM_IMPORT_COPY.desc,
            aliases: [UPSTREAM_IMPORT_COPY.button, 'Notebook Navigator import'],
            render: setting => renderUpstreamSettingsImportSetting(setting, context)
        })
    ];

    return [createGroupDefinition(TASK_ROWS_COPY.group, taskItems), createGroupDefinition(UPSTREAM_IMPORT_COPY.group, setupItems)];
}

/** Shared renderer for the task-row enable control. */
export function renderGcmTaskRowsEnabledSetting(setting: Setting, context: SettingsTabContext, onAfterUpdate?: () => void): void {
    const { plugin } = context;
    setting
        .setName(TASK_ROWS_COPY.enabledName)
        .setDesc(TASK_ROWS_COPY.enabledDesc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.tpsGcmTaskRowsEnabled).onChange(async value => {
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
