/*
 * TPS Notebook Navigator - read-free Markdown structure Type index.
 *
 * Obsidian's metadata cache is the parser authority. Only explicitly supported
 * top-level SectionCache kinds are indexed; unknown parser section kinds are
 * ignored so a future Obsidian parser change cannot silently create new Types.
 */

import { normalizePath, TFile, type App, type CachedMetadata, type SectionCache } from 'obsidian';
import {
    TPS_NAVIGATOR_MARKDOWN_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    isTpsNavigatorMarkdownTypeId,
    type TpsNavigatorMarkdownTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';
import { openMarkdownSourceLocation, type SourceLocationActivationResult } from './sourceLocation';

type MarkdownStructureLineKind = 'code' | 'callout' | 'blockquote' | 'table';

interface MarkdownStructureDefinition {
    readonly typeId: TpsNavigatorMarkdownTypeId;
    readonly sectionType: string;
    readonly lineKind: MarkdownStructureLineKind;
}

const DEFINITIONS: readonly MarkdownStructureDefinition[] = Object.freeze([
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
        sectionType: 'code',
        lineKind: 'code'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
        sectionType: 'callout',
        lineKind: 'callout'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
        sectionType: 'blockquote',
        lineKind: 'blockquote'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.TABLES,
        sectionType: 'table',
        lineKind: 'table'
    }
]);

const DEFINITION_BY_SECTION_TYPE = new Map(DEFINITIONS.map(definition => [definition.sectionType, definition] as const));

export type MarkdownStructureActivationResult =
    SourceLocationActivationResult | { readonly ok: false; readonly reason: 'invalid-record' | 'stale-locator' };

function isMarkdownNote(file: TFile, cache: CachedMetadata | null): boolean {
    return file.extension.toLocaleLowerCase() === 'md' && !isExcalidrawFile(file) && !hasExcalidrawFrontmatterFlagValue(cache?.frontmatter);
}

function getSectionRange(section: SectionCache): { startLine: number; endLine: number } | null {
    const startLine = Number(section.position?.start?.line);
    const rawEndLine = Number(section.position?.end?.line);
    const rawEndColumn = Number(section.position?.end?.col);
    if (!Number.isSafeInteger(startLine) || startLine < 0 || !Number.isSafeInteger(rawEndLine) || rawEndLine < startLine) {
        return null;
    }
    // Cache ranges may end at column zero on the line after the section. Treat
    // that boundary as exclusive while preserving a same-line empty section.
    const endLine = rawEndLine > startLine && rawEndColumn === 0 ? rawEndLine - 1 : rawEndLine;
    return { startLine: startLine + 1, endLine: Math.max(startLine, endLine) + 1 };
}

function createLocatorKey(
    typeId: TpsNavigatorMarkdownTypeId,
    sourcePath: string,
    startLine: number,
    endLine: number,
    blockId?: string
): string {
    const normalizedBlockId = blockId?.trim();
    if (normalizedBlockId) {
        return `markdown-section-id:${encodeURIComponent(typeId)}:${encodeURIComponent(sourcePath)}:${encodeURIComponent(normalizedBlockId)}`;
    }
    return `markdown-section:${encodeURIComponent(typeId)}:${encodeURIComponent(sourcePath)}:${startLine}:${endLine}`;
}

/** Maps one authoritative metadata-cache entry to immutable source-range records. */
export function getMarkdownStructureRecordsForFile(file: TFile, cache: CachedMetadata | null): readonly TpsNavigatorTypeRecord[] {
    if (!cache || !isMarkdownNote(file, cache) || !Array.isArray(cache.sections)) {
        return Object.freeze([]);
    }

    const records: TpsNavigatorTypeRecord[] = [];
    for (const section of cache.sections) {
        const definition = DEFINITION_BY_SECTION_TYPE.get(section.type);
        const range = definition ? getSectionRange(section) : null;
        if (!definition || !range) {
            continue;
        }
        const sourcePath = normalizePath(file.path);
        const blockId = section.id?.trim();
        const locatorKey = createLocatorKey(definition.typeId, sourcePath, range.startLine, range.endLine, blockId);
        records.push(
            Object.freeze({
                id: locatorKey,
                typeId: definition.typeId,
                // Compact file rows hide their secondary line, so retain both
                // the owning note and source line in the primary label.
                label: `${file.basename} · line ${range.startLine}`,
                sourcePath,
                entityType: 'block',
                lineKind: definition.lineKind,
                lineNumber: range.startLine,
                ...(range.endLine > range.startLine ? { lineEndNumber: range.endLine } : {}),
                ...(blockId ? { blockId } : {}),
                locatorKey,
                referenceTarget: blockId ? `[[${sourcePath}#^${blockId}]]` : sourcePath
            })
        );
    }
    return Object.freeze(records);
}

function compareRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return (
        left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: 'base' }) ||
        (left.lineNumber ?? 0) - (right.lineNumber ?? 0) ||
        left.locatorKey.localeCompare(right.locatorKey)
    );
}

function recordsMatch(left: readonly TpsNavigatorTypeRecord[] | undefined, right: readonly TpsNavigatorTypeRecord[]): boolean {
    return Boolean(
        left &&
        left.length === right.length &&
        left.every((record, index) => {
            const candidate = right[index];
            if (!candidate) {
                return false;
            }
            return (
                record.id === candidate.id &&
                record.typeId === candidate.typeId &&
                record.label === candidate.label &&
                record.sourcePath === candidate.sourcePath &&
                record.entityType === candidate.entityType &&
                record.lineKind === candidate.lineKind &&
                record.lineNumber === candidate.lineNumber &&
                record.lineEndNumber === candidate.lineEndNumber &&
                record.blockId === candidate.blockId &&
                record.locatorKey === candidate.locatorKey &&
                record.referenceTarget === candidate.referenceTarget
            );
        })
    );
}

function getVaultMarkdownFiles(app: App): TFile[] {
    const vault = app.vault as unknown as { getMarkdownFiles?: () => TFile[]; getFiles?: () => TFile[] };
    const files = typeof vault.getMarkdownFiles === 'function' ? vault.getMarkdownFiles() : (vault.getFiles?.() ?? []);
    return files.filter(file => file.extension.toLocaleLowerCase() === 'md');
}

/** Cache-aware, path-incremental source for Navigator-owned Markdown block Types. */
export class MarkdownStructureTypesIndex {
    private readonly recordsByPath = new Map<string, readonly TpsNavigatorTypeRecord[]>();
    private revision = 0;
    private snapshot = this.buildSnapshot();

    constructor(private readonly app: App) {}

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return this.snapshot;
    }

    /** Full cache-only rebuild used at startup and the first metadata resolved barrier. */
    rebuild(): TpsNavigatorTypesSnapshot {
        const nextRecordsByPath = new Map<string, readonly TpsNavigatorTypeRecord[]>();
        for (const file of getVaultMarkdownFiles(this.app)) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) {
                const previous = this.recordsByPath.get(normalizePath(file.path));
                if (previous) {
                    nextRecordsByPath.set(normalizePath(file.path), previous);
                }
                continue;
            }
            nextRecordsByPath.set(normalizePath(file.path), getMarkdownStructureRecordsForFile(file, cache));
        }
        this.recordsByPath.clear();
        nextRecordsByPath.forEach((records, path) => this.recordsByPath.set(path, records));
        return this.publish();
    }

    /** Applies the authoritative cache delivered by metadataCache.changed. */
    updateFile(file: TFile, cache: CachedMetadata): TpsNavigatorTypesSnapshot {
        const path = normalizePath(file.path);
        const records = getMarkdownStructureRecordsForFile(file, cache);
        if (recordsMatch(this.recordsByPath.get(path), records)) {
            return this.snapshot;
        }
        this.recordsByPath.set(path, records);
        return this.publish();
    }

    removePath(path: string): TpsNavigatorTypesSnapshot {
        if (!this.recordsByPath.delete(normalizePath(path))) {
            return this.snapshot;
        }
        return this.publish();
    }

    renameFile(file: TFile, oldPath: string): TpsNavigatorTypesSnapshot {
        const previousPath = normalizePath(oldPath);
        const nextPath = normalizePath(file.path);
        const previousRecords = this.recordsByPath.get(previousPath);
        const removedPreviousPath = previousPath !== nextPath && this.recordsByPath.delete(previousPath);
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) {
            return removedPreviousPath ? this.publish() : this.snapshot;
        }
        const nextRecords = getMarkdownStructureRecordsForFile(file, cache);
        if (previousPath === nextPath && recordsMatch(previousRecords, nextRecords)) {
            return this.snapshot;
        }
        this.recordsByPath.set(nextPath, nextRecords);
        return this.publish();
    }

    /** Revalidates the exact cached range before opening so stale rows fail closed. */
    async activate(record: TpsNavigatorTypeRecord): Promise<MarkdownStructureActivationResult> {
        if (
            !record ||
            !isTpsNavigatorMarkdownTypeId(record.typeId) ||
            record.entityType !== 'block' ||
            !Number.isSafeInteger(record.lineNumber) ||
            Number(record.lineNumber) < 1
        ) {
            return { ok: false, reason: 'invalid-record' };
        }
        const file = this.app.vault.getFileByPath(normalizePath(record.sourcePath));
        if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'md') {
            return { ok: false, reason: 'missing-file' };
        }
        const currentRecords = getMarkdownStructureRecordsForFile(file, this.app.metadataCache.getFileCache(file));
        const current = currentRecords.find(candidate => candidate.locatorKey === record.locatorKey && candidate.typeId === record.typeId);
        if (!current?.lineNumber) {
            return { ok: false, reason: 'stale-locator' };
        }
        return openMarkdownSourceLocation(this.app, file, current.lineNumber);
    }

    private publish(): TpsNavigatorTypesSnapshot {
        this.revision += 1;
        this.snapshot = this.buildSnapshot();
        return this.snapshot;
    }

    private buildSnapshot(): TpsNavigatorTypesSnapshot {
        const mutableRecords = new Map<TpsNavigatorMarkdownTypeId, TpsNavigatorTypeRecord[]>(
            TPS_NAVIGATOR_MARKDOWN_TYPES.map(descriptor => [descriptor.id as TpsNavigatorMarkdownTypeId, []])
        );
        this.recordsByPath.forEach(records => {
            records.forEach(record => {
                if (isTpsNavigatorMarkdownTypeId(record.typeId)) {
                    mutableRecords.get(record.typeId)?.push(record);
                }
            });
        });

        const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
        const descriptors: TpsNavigatorTypeDescriptor[] = TPS_NAVIGATOR_MARKDOWN_TYPES.map(definition => {
            const records = Object.freeze(
                [...(mutableRecords.get(definition.id as TpsNavigatorMarkdownTypeId) ?? [])].sort(compareRecords)
            );
            recordsByType.set(definition.id, records);
            return Object.freeze({ ...definition, count: records.length });
        });
        return Object.freeze({
            availability: 'ready',
            descriptors: Object.freeze(descriptors),
            recordsByType,
            revision: this.revision
        });
    }
}
