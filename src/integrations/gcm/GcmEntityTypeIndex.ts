/*
 * TPS Notebook Navigator - optional GCM entity-index adapter.
 *
 * This module intentionally depends only on GCM's structural public API. The
 * navigator remains usable when GCM is absent, disabled, outdated, or unable
 * to finish indexing a Markdown source.
 */

import type { App, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';
import {
    TPS_NAVIGATOR_STRUCTURAL_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    createTpsNavigatorKindTypeId,
    getTpsNavigatorKindValue,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';

export const GCM_ENTITY_INDEX_API_VERSION = 3;
export const GCM_ENTITY_INDEX_KIND_DIMENSION = 'kind';

const SYNTHETIC_STRUCTURAL_KIND_VALUES = new Set(['task', 'bullet', 'heading']);
const EMPTY_DESCRIPTORS = Object.freeze([]) as readonly TpsNavigatorTypeDescriptor[];
const EMPTY_RECORDS_BY_TYPE = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();

export type GcmEntityIndexEntityType = 'note' | 'block';
export type GcmEntityIndexLineKind = 'task' | 'bullet' | 'heading';

export interface GcmEntityIndexRecordLike {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly displayName: string;
    readonly basename: string;
    readonly dimensions: Readonly<Record<string, readonly string[]>>;
    readonly sourcePath: string;
    readonly entityType: GcmEntityIndexEntityType;
    readonly subpath: string;
    readonly blockId: string;
    readonly lineKind?: GcmEntityIndexLineKind;
    /** One-based source line supplied by GCM. */
    readonly lineNumber?: number;
    readonly referenceState: 'ready' | 'provisional';
    readonly locatorKey: string;
    readonly referenceTarget: string;
}

export interface GcmEntityIndexDimensionPredicateLike {
    anyOf?: string | readonly string[];
    allOf?: string | readonly string[];
    noneOf?: string | readonly string[];
}

export type GcmEntityIndexFilterLike = Readonly<
    Record<string, string | readonly string[] | GcmEntityIndexDimensionPredicateLike | null | undefined>
>;

export interface GcmEntityIndexQueryLike {
    allOf?: GcmEntityIndexFilterLike;
    anyOf?: GcmEntityIndexFilterLike;
    noneOf?: GcmEntityIndexFilterLike;
    dimensions?: GcmEntityIndexFilterLike;
    search?: string;
    entityTypes?: GcmEntityIndexEntityType | readonly GcmEntityIndexEntityType[];
    lineKinds?: GcmEntityIndexLineKind | readonly GcmEntityIndexLineKind[];
    limit?: number;
}

export interface GcmEntityIndexApiLike {
    readonly version: 3;
    queryAsync(query?: GcmEntityIndexQueryLike): Promise<readonly unknown[]>;
    ensureReady(): Promise<void>;
    getByLocator(locator: string): unknown;
    getDimensionValues(dimension: string): readonly string[];
    getRevision(): number;
    onChanged(listener: (revision: number) => void): () => void;
    registerDimension(definition: { name: string; propertyKeys: readonly string[] }): () => void;
}

export type GcmEntityIndexIssueCode =
    'gcm-unavailable' | 'gcm-incompatible' | 'entity-index-incomplete' | 'entity-index-error' | 'invalid-type';

export interface GcmEntityIndexIssue {
    readonly code: GcmEntityIndexIssueCode;
    readonly message: string;
    readonly failedPaths?: readonly string[];
    readonly cause?: unknown;
}

export interface GcmEntityTypeIndexSnapshot extends TpsNavigatorTypesSnapshot {
    readonly issue?: GcmEntityIndexIssue;
}

export type GcmEntityTypeQueryResult =
    | {
          readonly ok: true;
          readonly typeId: TpsNavigatorTypeId;
          readonly records: readonly TpsNavigatorTypeRecord[];
          readonly revision: number;
      }
    | {
          readonly ok: false;
          readonly typeId: TpsNavigatorTypeId;
          readonly issue: GcmEntityIndexIssue;
      };

export type GcmEntityActivationFailureReason =
    | 'gcm-unavailable'
    | 'invalid-record'
    | 'stale-locator'
    | 'missing-file'
    | 'workspace-unavailable'
    | 'editor-unavailable'
    | 'open-failed';

export type GcmEntityActivationResult =
    | {
          readonly ok: true;
          readonly sourcePath: string;
          /** One-based source line, omitted for note-backed entities. */
          readonly lineNumber?: number;
      }
    | {
          readonly ok: false;
          readonly reason: GcmEntityActivationFailureReason;
          readonly error?: unknown;
      };

export type GcmEntityIndexRevisionListener = (revision: number) => void;

export interface GcmApiChangedPayloadLike {
    readonly source: 'tps-global-context-menu';
    readonly sourcePluginId: string;
    readonly available: boolean;
    readonly api: unknown;
    readonly entityIndexVersion?: number | null;
}

interface EditorLike {
    setCursor(position: { line: number; ch: number }): void;
    scrollIntoView?(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean): void;
    focus?(): void;
}

interface WorkspaceLeafLike {
    view?: {
        file?: { path?: string } | null;
        editor?: EditorLike;
    };
    openFile(file: TFile, options?: { state?: { mode?: string }; active?: boolean }): Promise<void>;
}

interface WorkspaceLike {
    activeLeaf?: WorkspaceLeafLike | null;
    getLeaf(newLeaf?: boolean): WorkspaceLeafLike;
    getLeavesOfType?(viewType: string): WorkspaceLeafLike[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isCallable(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === 'function';
}

export function isGcmEntityIndexApiLike(value: unknown): value is GcmEntityIndexApiLike {
    if (!isRecord(value) || value.version !== GCM_ENTITY_INDEX_API_VERSION) {
        return false;
    }
    return (
        isCallable(value.queryAsync) &&
        isCallable(value.ensureReady) &&
        isCallable(value.getByLocator) &&
        isCallable(value.getDimensionValues) &&
        isCallable(value.getRevision) &&
        isCallable(value.onChanged) &&
        isCallable(value.registerDimension)
    );
}

function isGcmApiChangedPayload(value: unknown): value is GcmApiChangedPayloadLike {
    return (
        isRecord(value) &&
        value.source === 'tps-global-context-menu' &&
        value.sourcePluginId === TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID &&
        typeof value.available === 'boolean' &&
        (value.api === null || isRecord(value.api))
    );
}

/** Resolves only the exact Entity Index v3 API from GCM's public change-event payload. */
export function resolveGcmEntityIndexApi(payload: unknown): GcmEntityIndexApiLike | null {
    if (!isGcmApiChangedPayload(payload) || payload.available !== true || !isRecord(payload.api)) {
        return null;
    }
    return isGcmEntityIndexApiLike(payload.api.entityIndex) ? payload.api.entityIndex : null;
}

function isLineKind(value: unknown): value is GcmEntityIndexLineKind {
    return value === 'task' || value === 'bullet' || value === 'heading';
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isDimensions(value: unknown): value is Readonly<Record<string, readonly string[]>> {
    return isRecord(value) && Object.values(value).every(isStringArray);
}

export function isGcmEntityIndexRecord(value: unknown): value is GcmEntityIndexRecordLike {
    if (!isRecord(value)) {
        return false;
    }
    const entityType = value.entityType;
    const lineNumber = value.lineNumber;
    if (
        typeof value.id !== 'string' ||
        typeof value.path !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.displayName !== 'string' ||
        typeof value.basename !== 'string' ||
        !isDimensions(value.dimensions) ||
        typeof value.sourcePath !== 'string' ||
        !value.sourcePath.trim() ||
        (entityType !== 'note' && entityType !== 'block') ||
        typeof value.subpath !== 'string' ||
        typeof value.blockId !== 'string' ||
        (value.referenceState !== 'ready' && value.referenceState !== 'provisional') ||
        typeof value.locatorKey !== 'string' ||
        !value.locatorKey.trim() ||
        typeof value.referenceTarget !== 'string'
    ) {
        return false;
    }
    if (value.lineKind !== undefined && !isLineKind(value.lineKind)) {
        return false;
    }
    if (lineNumber !== undefined && (!Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1)) {
        return false;
    }
    if (entityType === 'block' && (!isLineKind(value.lineKind) || !Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1)) {
        return false;
    }
    return true;
}

function normalizeIdentity(value: string): string {
    return value.trim().toLocaleLowerCase();
}

function getDimensionValues(record: GcmEntityIndexRecordLike, dimensionName: string): readonly string[] {
    const matchingKey = Object.keys(record.dimensions).find(key => normalizeIdentity(key) === normalizeIdentity(dimensionName));
    return matchingKey ? (record.dimensions[matchingKey] ?? []) : [];
}

function hasDimensionValue(record: GcmEntityIndexRecordLike, dimensionName: string, value: string): boolean {
    const identity = normalizeIdentity(value);
    return Boolean(identity) && getDimensionValues(record, dimensionName).some(candidate => normalizeIdentity(candidate) === identity);
}

function getStructuralTypeId(record: GcmEntityIndexRecordLike): TpsNavigatorTypeId | null {
    if (record.entityType === 'note') {
        return TPS_NAVIGATOR_TYPE_IDS.NOTES;
    }
    if (record.lineKind === 'task') {
        return TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
    }
    if (record.lineKind === 'bullet') {
        return TPS_NAVIGATOR_TYPE_IDS.BULLETS;
    }
    if (record.lineKind === 'heading') {
        return TPS_NAVIGATOR_TYPE_IDS.HEADINGS;
    }
    return null;
}

function matchesType(record: GcmEntityIndexRecordLike, typeId: TpsNavigatorTypeId): boolean {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.NOTES) {
        return record.entityType === 'note';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        return record.entityType === 'block' && record.lineKind === 'task';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BULLETS) {
        return record.entityType === 'block' && record.lineKind === 'bullet';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.HEADINGS) {
        return record.entityType === 'block' && record.lineKind === 'heading';
    }
    const kind = getTpsNavigatorKindValue(typeId);
    return kind !== null && !SYNTHETIC_STRUCTURAL_KIND_VALUES.has(normalizeIdentity(kind)) && hasDimensionValue(record, 'kind', kind);
}

function toNavigatorRecord(record: GcmEntityIndexRecordLike, typeId: TpsNavigatorTypeId): TpsNavigatorTypeRecord {
    const label = record.displayName.trim() || record.name.trim() || record.basename.trim() || record.sourcePath;
    return Object.freeze({
        id: record.id,
        typeId,
        label,
        sourcePath: record.sourcePath,
        entityType: record.entityType,
        ...(record.lineKind ? { lineKind: record.lineKind } : {}),
        ...(record.lineNumber !== undefined ? { lineNumber: record.lineNumber } : {}),
        locatorKey: record.locatorKey,
        referenceTarget: record.referenceTarget
    });
}

function compareNavigatorRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return (
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) ||
        left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: 'base' }) ||
        (left.lineNumber ?? 0) - (right.lineNumber ?? 0) ||
        left.id.localeCompare(right.id)
    );
}

function uniqueKindValues(values: readonly string[]): readonly string[] {
    const valuesByIdentity = new Map<string, string>();
    for (const value of values) {
        const displayValue = String(value ?? '').trim();
        const identity = normalizeIdentity(displayValue);
        if (!identity || SYNTHETIC_STRUCTURAL_KIND_VALUES.has(identity) || valuesByIdentity.has(identity)) {
            continue;
        }
        valuesByIdentity.set(identity, displayValue);
    }
    return Object.freeze(
        [...valuesByIdentity.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    );
}

function createKindDescriptors(kindValues: readonly string[]): readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] {
    return Object.freeze(
        uniqueKindValues(kindValues).flatMap(kind => {
            const id = createTpsNavigatorKindTypeId(kind);
            return id
                ? [
                      Object.freeze({
                          id,
                          label: kind,
                          icon: 'lucide-shapes',
                          category: 'kind' as const
                      })
                  ]
                : [];
        })
    );
}

function asRecordArray(value: readonly unknown[]): readonly GcmEntityIndexRecordLike[] {
    return Object.freeze(value.filter(isGcmEntityIndexRecord));
}

function safeRevision(api: GcmEntityIndexApiLike): number {
    const revision = api.getRevision();
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function extractFailedPaths(error: unknown): readonly string[] {
    if (!isRecord(error) || !Array.isArray(error.failedPaths)) {
        return Object.freeze([]);
    }
    return Object.freeze(
        [
            ...new Set(
                error.failedPaths
                    .filter((path): path is string => typeof path === 'string' && Boolean(path.trim()))
                    .map(path => path.trim())
            )
        ].sort()
    );
}

function issueFromError(error: unknown): GcmEntityIndexIssue {
    if (isRecord(error) && error.code === 'entity-index-incomplete') {
        const failedPaths = extractFailedPaths(error);
        return {
            code: 'entity-index-incomplete',
            message:
                failedPaths.length > 0
                    ? `The entity index could not read ${failedPaths.length} Markdown source${failedPaths.length === 1 ? '' : 's'}.`
                    : 'The entity index is incomplete.',
            failedPaths,
            cause: error
        };
    }
    return {
        code: 'entity-index-error',
        message: 'The entity index could not be loaded.',
        cause: error
    };
}

function unavailableSnapshot(issue: GcmEntityIndexIssue): GcmEntityTypeIndexSnapshot {
    return {
        availability: issue.code === 'gcm-unavailable' || issue.code === 'gcm-incompatible' ? 'unavailable' : 'error',
        descriptors: EMPTY_DESCRIPTORS,
        recordsByType: EMPTY_RECORDS_BY_TYPE,
        revision: 0,
        message: issue.message,
        issue
    };
}

function buildSnapshot(
    records: readonly GcmEntityIndexRecordLike[],
    kindValues: readonly string[],
    revision: number
): GcmEntityTypeIndexSnapshot {
    const descriptorDefinitions = [...TPS_NAVIGATOR_STRUCTURAL_TYPES, ...createKindDescriptors(kindValues)];
    const mutableRecords = new Map<TpsNavigatorTypeId, TpsNavigatorTypeRecord[]>();
    const kindTypeByIdentity = new Map<string, TpsNavigatorTypeId>();
    for (const descriptor of descriptorDefinitions) {
        mutableRecords.set(descriptor.id, []);
        if (descriptor.category === 'kind') {
            const kind = getTpsNavigatorKindValue(descriptor.id);
            if (kind) {
                kindTypeByIdentity.set(normalizeIdentity(kind), descriptor.id);
            }
        }
    }

    for (const record of records) {
        const structuralType = getStructuralTypeId(record);
        if (structuralType) {
            mutableRecords.get(structuralType)?.push(toNavigatorRecord(record, structuralType));
        }
        const matchedKindTypes = new Set<TpsNavigatorTypeId>();
        for (const kindValue of getDimensionValues(record, GCM_ENTITY_INDEX_KIND_DIMENSION)) {
            const typeId = kindTypeByIdentity.get(normalizeIdentity(kindValue));
            if (!typeId || matchedKindTypes.has(typeId)) {
                continue;
            }
            matchedKindTypes.add(typeId);
            mutableRecords.get(typeId)?.push(toNavigatorRecord(record, typeId));
        }
    }

    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors = descriptorDefinitions.map(definition => {
        const typeRecords = Object.freeze([...(mutableRecords.get(definition.id) ?? [])].sort(compareNavigatorRecords));
        recordsByType.set(definition.id, typeRecords);
        return Object.freeze({ ...definition, count: typeRecords.length });
    });
    return {
        availability: 'ready',
        descriptors: Object.freeze(descriptors),
        recordsByType,
        revision
    };
}

function queryForType(typeId: TpsNavigatorTypeId): GcmEntityIndexQueryLike | null {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.NOTES) {
        return { entityTypes: 'note' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        return { entityTypes: 'block', lineKinds: 'task' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BULLETS) {
        return { entityTypes: 'block', lineKinds: 'bullet' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.HEADINGS) {
        return { entityTypes: 'block', lineKinds: 'heading' };
    }
    const kind = getTpsNavigatorKindValue(typeId);
    if (!kind || SYNTHETIC_STRUCTURAL_KIND_VALUES.has(normalizeIdentity(kind))) {
        return null;
    }
    return { dimensions: { kind } };
}

function isMarkdownFile(file: TFile | null): file is TFile {
    return Boolean(file && typeof file.path === 'string' && file.path.trim() && file.extension.toLocaleLowerCase() === 'md');
}

function getLeafEditor(leaf: WorkspaceLeafLike | null | undefined): EditorLike | null {
    const editor = leaf?.view?.editor;
    return editor && typeof editor.setCursor === 'function' ? editor : null;
}

function findEditor(workspace: WorkspaceLike, preferredLeaf: WorkspaceLeafLike, sourcePath: string): EditorLike | null {
    if (preferredLeaf.view?.file?.path === sourcePath) {
        const preferredEditor = getLeafEditor(preferredLeaf);
        if (preferredEditor) {
            return preferredEditor;
        }
    }
    const activeLeaf = workspace.activeLeaf;
    if (activeLeaf?.view?.file?.path === sourcePath) {
        const activeEditor = getLeafEditor(activeLeaf);
        if (activeEditor) {
            return activeEditor;
        }
    }
    try {
        const matchingLeaf = workspace.getLeavesOfType?.('markdown').find(leaf => leaf.view?.file?.path === sourcePath);
        return getLeafEditor(matchingLeaf);
    } catch {
        return null;
    }
}

/**
 * Owns the optional v3 API registration/subscription lifecycle. Call dispose()
 * when its navigation consumer unloads.
 */
export class GcmEntityTypeIndexAdapter {
    private api: GcmEntityIndexApiLike | null = null;
    private connectionIssue: GcmEntityIndexIssue | null = null;
    private unregisterDimension: (() => void) | null = null;
    private unsubscribeRevision: (() => void) | null = null;
    private readonly revisionListeners = new Set<GcmEntityIndexRevisionListener>();

    constructor(private readonly app: App) {}

    /** Accepts one public GCM API change payload and ignores unrelated workspace events. */
    acceptApiPayload(payload: unknown): boolean {
        if (!isGcmApiChangedPayload(payload)) {
            return false;
        }
        if (!payload.available) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-unavailable',
                message: 'TPS Global Context Menu is unavailable or disabled.'
            };
            return true;
        }
        const api = resolveGcmEntityIndexApi(payload);
        if (!api) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: `TPS Global Context Menu entity index API v${GCM_ENTITY_INDEX_API_VERSION} is required.`
            };
            return true;
        }
        this.connect(api);
        return true;
    }

    /** Swaps registrations safely when GCM publishes a new API instance. */
    connect(candidate: unknown): boolean {
        if (!isGcmEntityIndexApiLike(candidate)) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: `TPS Global Context Menu entity index API v${GCM_ENTITY_INDEX_API_VERSION} is required.`
            };
            return false;
        }
        const api = candidate;
        if (this.api === api) {
            return true;
        }

        this.releaseApi();
        let unregisterDimension: (() => void) | null = null;
        let unsubscribeRevision: (() => void) | null = null;
        try {
            unregisterDimension = api.registerDimension({ name: GCM_ENTITY_INDEX_KIND_DIMENSION, propertyKeys: [] });
            if (typeof unregisterDimension !== 'function') {
                throw new Error('GCM entity index registerDimension() did not return a disposer.');
            }
            unsubscribeRevision = api.onChanged(revision => {
                const nextRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : safeRevision(api);
                for (const listener of [...this.revisionListeners]) {
                    try {
                        listener(nextRevision);
                    } catch {
                        // One consumer must not break GCM's global revision dispatch.
                    }
                }
            });
            if (typeof unsubscribeRevision !== 'function') {
                throw new Error('GCM entity index onChanged() did not return a disposer.');
            }
        } catch (error) {
            try {
                unsubscribeRevision?.();
            } catch {
                // Best-effort cleanup of an incomplete foreign API connection.
            }
            try {
                unregisterDimension?.();
            } catch {
                // Best-effort cleanup of an incomplete foreign API connection.
            }
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: 'TPS Global Context Menu entity index v3 could not be initialized.',
                cause: error
            };
            return false;
        }

        this.api = api;
        this.unregisterDimension = unregisterDimension;
        this.unsubscribeRevision = unsubscribeRevision;
        this.connectionIssue = null;
        return true;
    }

    subscribe(listener: GcmEntityIndexRevisionListener): () => void {
        this.revisionListeners.add(listener);
        return () => {
            this.revisionListeners.delete(listener);
        };
    }

    getRevision(): number | null {
        if (!this.api) {
            return null;
        }
        try {
            return safeRevision(this.api);
        } catch {
            return null;
        }
    }

    async loadSnapshot(): Promise<GcmEntityTypeIndexSnapshot> {
        if (!this.api) {
            return unavailableSnapshot(
                this.connectionIssue ?? {
                    code: 'gcm-unavailable',
                    message: 'TPS Global Context Menu entity index is unavailable.'
                }
            );
        }
        const api = this.api;
        try {
            await api.ensureReady();
            const records = asRecordArray(await api.queryAsync({}));
            const kindValues = api.getDimensionValues(GCM_ENTITY_INDEX_KIND_DIMENSION);
            return buildSnapshot(records, kindValues, safeRevision(api));
        } catch (error) {
            return unavailableSnapshot(issueFromError(error));
        }
    }

    async queryType(typeId: TpsNavigatorTypeId): Promise<GcmEntityTypeQueryResult> {
        const query = isTpsNavigatorTypeId(typeId) ? queryForType(typeId) : null;
        if (!query) {
            return {
                ok: false,
                typeId,
                issue: {
                    code: 'invalid-type',
                    message: `The navigator type "${String(typeId)}" is not queryable.`
                }
            };
        }
        if (!this.api) {
            return {
                ok: false,
                typeId,
                issue:
                    this.connectionIssue ??
                    ({
                        code: 'gcm-unavailable',
                        message: 'TPS Global Context Menu entity index is unavailable.'
                    } satisfies GcmEntityIndexIssue)
            };
        }
        const api = this.api;
        try {
            await api.ensureReady();
            const records = asRecordArray(await api.queryAsync(query))
                .filter(record => matchesType(record, typeId))
                .map(record => toNavigatorRecord(record, typeId))
                .sort(compareNavigatorRecords);
            return {
                ok: true,
                typeId,
                records: Object.freeze(records),
                revision: safeRevision(api)
            };
        } catch (error) {
            return { ok: false, typeId, issue: issueFromError(error) };
        }
    }

    /** Re-resolves the locator immediately before direct Obsidian activation. */
    async activate(record: TpsNavigatorTypeRecord): Promise<GcmEntityActivationResult> {
        if (
            !record ||
            !isTpsNavigatorTypeId(record.typeId) ||
            typeof record.locatorKey !== 'string' ||
            !record.locatorKey.trim() ||
            (record.entityType !== 'note' && record.entityType !== 'block')
        ) {
            return { ok: false, reason: 'invalid-record' };
        }
        if (!this.api) {
            return { ok: false, reason: 'gcm-unavailable' };
        }

        let current: unknown;
        try {
            current = this.api.getByLocator(record.locatorKey);
        } catch (error) {
            return { ok: false, reason: 'stale-locator', error };
        }
        if (!isGcmEntityIndexRecord(current) || current.entityType !== record.entityType || !matchesType(current, record.typeId)) {
            return { ok: false, reason: 'stale-locator' };
        }

        const sourcePath = current.sourcePath.replace(/\\/gu, '/');
        const file = this.app.vault.getFileByPath(sourcePath);
        if (!isMarkdownFile(file)) {
            return { ok: false, reason: 'missing-file' };
        }

        const workspace = (this.app as unknown as { workspace?: WorkspaceLike }).workspace;
        if (!workspace || typeof workspace.getLeaf !== 'function') {
            return { ok: false, reason: 'workspace-unavailable' };
        }
        let leaf: WorkspaceLeafLike;
        try {
            leaf = workspace.getLeaf(false);
            await leaf.openFile(file, current.entityType === 'block' ? { state: { mode: 'source' }, active: true } : { active: true });
        } catch (error) {
            return { ok: false, reason: 'open-failed', error };
        }

        if (current.entityType === 'note') {
            return { ok: true, sourcePath };
        }
        const lineNumber = current.lineNumber;
        if (!Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1) {
            return { ok: false, reason: 'stale-locator' };
        }
        const editor = findEditor(workspace, leaf, sourcePath);
        if (!editor) {
            return { ok: false, reason: 'editor-unavailable' };
        }
        const position = { line: Number(lineNumber) - 1, ch: 0 };
        editor.setCursor(position);
        editor.scrollIntoView?.({ from: position, to: position }, true);
        editor.focus?.();
        return { ok: true, sourcePath, lineNumber: Number(lineNumber) };
    }

    dispose(): void {
        this.releaseApi();
        this.revisionListeners.clear();
        this.connectionIssue = null;
    }

    private releaseApi(): void {
        const unsubscribeRevision = this.unsubscribeRevision;
        const unregisterDimension = this.unregisterDimension;
        this.api = null;
        this.unsubscribeRevision = null;
        this.unregisterDimension = null;
        try {
            unsubscribeRevision?.();
        } catch {
            // Best-effort cleanup of a foreign optional API.
        }
        try {
            unregisterDimension?.();
        } catch {
            // Best-effort cleanup of a foreign optional API.
        }
    }
}
