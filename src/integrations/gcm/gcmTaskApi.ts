/*
 * TPS Notebook Navigator - structural adapter for the optional GCM task API.
 *
 * This file deliberately has no source or runtime import from GCM. The fork
 * remains usable when GCM is absent, disabled, outdated, or fails to load.
 */

import type { App } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';

export interface GcmTaskRefLike {
    path: string;
    lineNumber: number;
    rawLine: string;
    title: string;
}

export interface GcmTaskRecordLike extends GcmTaskRefLike {
    id?: string;
    checkbox: string;
    marker: string;
    status: string;
    isComplete: boolean;
    tags: string[];
}

export interface GcmTaskMutationResultLike {
    ok: boolean;
    changed: boolean;
    error?: string;
}

export interface GcmTaskApiLike {
    readonly version: number;
    list(filter: { paths: string[]; includeCompleted: boolean; maxResults: number }): Promise<GcmTaskRecordLike[]>;
    focus(ref: GcmTaskRefLike): Promise<boolean>;
    /** Available in current GCM v1 builds; optional so older compatible builds stay display-only. */
    setCheckbox?(ref: GcmTaskRefLike, checkbox: string): Promise<GcmTaskMutationResultLike>;
}

interface PluginManagerLike {
    enabledPlugins?: { has(pluginId: string): boolean } | string[];
    getPlugin?(pluginId: string): unknown;
    plugins?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isGcmTaskApiLike(value: unknown): value is GcmTaskApiLike {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.version === 'number' && value.version >= 1 && typeof value.list === 'function' && typeof value.focus === 'function';
}

function isExplicitlyDisabled(manager: PluginManagerLike, pluginId: string): boolean {
    const enabled = manager.enabledPlugins;
    if (!enabled) {
        return false;
    }
    if (Array.isArray(enabled)) {
        return !enabled.includes(pluginId);
    }
    return !enabled.has(pluginId);
}

export function resolveGcmTaskApi(app: App): GcmTaskApiLike | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) {
        return null;
    }

    let plugin: unknown = null;
    try {
        plugin = manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
    } catch {
        return null;
    }

    if (!isRecord(plugin) || !isRecord(plugin.api)) {
        return null;
    }
    const tasks = plugin.api.tasks;
    if (!isGcmTaskApiLike(tasks)) {
        return null;
    }

    return tasks;
}

export function isGcmTaskRecord(value: unknown): value is GcmTaskRecordLike {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const task = value as Record<string, unknown>;
    return (
        typeof task.path === 'string' &&
        typeof task.lineNumber === 'number' &&
        Number.isSafeInteger(task.lineNumber) &&
        task.lineNumber >= 0 &&
        typeof task.rawLine === 'string' &&
        typeof task.title === 'string' &&
        typeof task.checkbox === 'string' &&
        typeof task.marker === 'string' &&
        typeof task.status === 'string' &&
        typeof task.isComplete === 'boolean' &&
        Array.isArray(task.tags)
    );
}
