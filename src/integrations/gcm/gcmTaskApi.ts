/*
 * TPS Notebook Navigator - structural adapter for the optional GCM property and native-record APIs.
 *
 * This file deliberately has no source or runtime import from GCM. The fork
 * remains usable when GCM is absent, disabled, outdated, or fails to load.
 */

import type { App, MenuItem, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';

export interface GcmItemPropertyDefinitionLike {
    id: string;
    key: string;
    label: string;
    type: string;
    listItemType?: string;
    allowInlineSet: boolean;
}

export interface GcmItemPropertiesApiLike {
    readonly version: number;
    readonly supportsTaskLineMutation?: boolean;
    listDefinitions(): readonly GcmItemPropertyDefinitionLike[];
    resolveDefinition(keyOrId: unknown): GcmItemPropertyDefinitionLike | null;
}

export interface GcmFrontmatterApiLike {
    setValues(files: TFile[], updates: Record<string, unknown>, cause?: unknown): Promise<unknown>;
    addListValues(files: TFile[], key: string, values: unknown[], cause?: unknown): Promise<unknown>;
}

export interface GcmFilePropertiesApiLike extends GcmFrontmatterApiLike {
    readonly version: number;
    isTarget(file: TFile): boolean;
}

export interface GcmNativeRecordInspectionLike {
    readonly id: string;
    readonly kind: string;
    readonly schemaVersion: number;
    readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface GcmNativeRecordsApiLike {
    readonly version: number;
    getMode(): unknown;
    inspect(frontmatter: unknown): GcmNativeRecordInspectionLike | null;
}

/** Small synchronous menu surface used instead of exposing Obsidian's Menu object. */
export interface GcmTaskMenuLike {
    addItem(callback: (item: MenuItem) => void): unknown;
    addSeparator(): unknown;
}

interface PluginManagerLike {
    enabledPlugins?: { has(pluginId: string): boolean } | string[];
    getPlugin?(pluginId: string): unknown;
    plugins?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

export function isGcmItemPropertiesApiLike(value: unknown): value is GcmItemPropertiesApiLike {
    return (
        isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 1 &&
        typeof value.listDefinitions === 'function' &&
        typeof value.resolveDefinition === 'function'
    );
}

export function isGcmNativeRecordsApiLike(value: unknown): value is GcmNativeRecordsApiLike {
    return (
        isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 2 &&
        typeof value.getMode === 'function' &&
        typeof value.inspect === 'function'
    );
}

function resolveGcmPluginApi(app: App): Record<string, unknown> | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) return null;
    try {
        const plugin =
            manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
        return isRecord(plugin) && isRecord(plugin.api) ? plugin.api : null;
    } catch {
        return null;
    }
}

export function resolveGcmItemPropertiesApi(app: App): GcmItemPropertiesApiLike | null {
    const api = resolveGcmPluginApi(app);
    return api && isGcmItemPropertiesApiLike(api.itemProperties) ? api.itemProperties : null;
}

export function resolveGcmFrontmatterApi(app: App): GcmFrontmatterApiLike | null {
    const value = resolveGcmPluginApi(app)?.frontmatter;
    return isRecord(value) && typeof value.setValues === 'function' && typeof value.addListValues === 'function'
        ? (value as unknown as GcmFrontmatterApiLike)
        : null;
}

export function resolveGcmFilePropertiesApi(app: App): GcmFilePropertiesApiLike | null {
    const value = resolveGcmPluginApi(app)?.fileProperties;
    return isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 1 &&
        typeof value.isTarget === 'function' &&
        typeof value.setValues === 'function' &&
        typeof value.addListValues === 'function'
        ? (value as unknown as GcmFilePropertiesApiLike)
        : null;
}

export function resolveGcmNativeRecordsApi(app: App): GcmNativeRecordsApiLike | null {
    const value = resolveGcmPluginApi(app)?.nativeRecords;
    return isGcmNativeRecordsApiLike(value) ? value : null;
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
