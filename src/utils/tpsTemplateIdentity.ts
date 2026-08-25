import type { App, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../constants/tpsIdentity';
import { getPluginById, getRecordValue, isRecord } from './typeGuards';

export interface TpsTemplateIdentityApi {
    version: number;
    getMode: () => string;
    matches: (file: TFile) => boolean;
}

export function getTpsTemplateIdentityApi(app: App): TpsTemplateIdentityApi | null {
    const plugin = getPluginById(app, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    if (!plugin || !isRecord(plugin)) {
        return null;
    }
    const api = getRecordValue(plugin, 'api');
    if (!isRecord(api)) {
        return null;
    }
    const templates = getRecordValue(api, 'templates');
    if (!isRecord(templates)) {
        return null;
    }
    const getMode = getRecordValue(templates, 'getMode');
    const matches = getRecordValue(templates, 'matches');
    if (getRecordValue(templates, 'version') !== 1 || typeof getMode !== 'function' || typeof matches !== 'function') {
        return null;
    }
    return {
        version: 1,
        getMode: () => String(getMode.call(templates)),
        matches: (file: TFile) => matches.call(templates, file) === true
    };
}

export function getTpsTemplateIdentificationMode(app: App): string | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api) {
        return null;
    }
    try {
        return api.getMode();
    } catch {
        return null;
    }
}

export function isTpsTemplateFile(app: App, file: TFile): boolean | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api) {
        return null;
    }
    try {
        return api.matches(file);
    } catch {
        return false;
    }
}
