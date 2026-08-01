/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { createSettingGroupFactory } from '../../settingGroups';
import {
    renderGcmTaskRowsEnabledSetting,
    renderGcmTaskRowsIncludeCompletedSetting,
    renderGcmTaskRowsPerNoteSetting,
    renderTpsTypesNavigationEnabledSetting,
    renderUpstreamSettingsImportSetting,
    setTpsTaskRowSettingVisibility
} from '../TpsIntegrationTab';
import type { SettingsTabContext } from '../SettingsTabContext';

/** Legacy renderer for the fork-specific TPS integration destination. */
export function renderTpsIntegrationTab(context: SettingsTabContext): void {
    const createGroup = createSettingGroupFactory(context.containerEl);
    const typesGroup = createGroup('Types navigation');
    const taskGroup = createGroup('Task rows');
    const setupGroup = createGroup('One-way setup');

    let includeCompletedSettingEl: HTMLElement | null = null;
    let taskLimitSettingEl: HTMLElement | null = null;
    const updateTaskRowVisibility = () => {
        setTpsTaskRowSettingVisibility([includeCompletedSettingEl, taskLimitSettingEl], context.plugin.settings.tpsGcmTaskRowsEnabled);
    };

    typesGroup.addSetting(setting => renderTpsTypesNavigationEnabledSetting(setting, context));
    taskGroup.addSetting(setting => renderGcmTaskRowsEnabledSetting(setting, context, updateTaskRowVisibility));
    const includeCompletedSetting = taskGroup.addSetting(setting => renderGcmTaskRowsIncludeCompletedSetting(setting, context));
    includeCompletedSettingEl = includeCompletedSetting.settingEl;
    const taskLimitSetting = taskGroup.addSetting(setting => renderGcmTaskRowsPerNoteSetting(setting, context));
    taskLimitSettingEl = taskLimitSetting.settingEl;
    updateTaskRowVisibility();

    setupGroup.addSetting(setting => renderUpstreamSettingsImportSetting(setting, context));
}
