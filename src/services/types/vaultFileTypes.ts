/*
 * TPS Notebook Navigator - synchronous, read-free vault file Type catalog.
 *
 * File-backed Types deliberately use only TFile metadata and Obsidian's
 * metadata cache. Classification never reads file bodies, PDFs, or binaries.
 */

import type { App, TFile } from 'obsidian';
import {
    TPS_NAVIGATOR_FILE_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorFileTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'svg', 'tif', 'tiff']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'aif', 'aiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'mpg', 'mpeg']);

function isExcalidrawDrawing(app: App, file: TFile): boolean {
    const extension = file.extension.toLocaleLowerCase();
    if (extension === 'excalidraw' || isExcalidrawFile(file)) {
        return true;
    }
    if (extension !== 'md') {
        return false;
    }
    const metadataCache = app.metadataCache as unknown as {
        getFileCache?: (target: TFile) => { frontmatter?: unknown } | null | undefined;
    };
    return hasExcalidrawFrontmatterFlagValue(metadataCache?.getFileCache?.(file)?.frontmatter);
}

/** Returns exactly one built-in file bucket for a supported vault file. */
export function getTpsNavigatorFileTypeId(app: App, file: TFile): TpsNavigatorFileTypeId | null {
    const extension = String(file?.extension ?? '').toLocaleLowerCase();
    if (!extension) {
        return null;
    }
    if (isExcalidrawDrawing(app, file)) {
        return TPS_NAVIGATOR_TYPE_IDS.DRAWINGS;
    }
    if (extension === 'md') {
        return TPS_NAVIGATOR_TYPE_IDS.NOTES;
    }
    if (extension === 'base') {
        return TPS_NAVIGATOR_TYPE_IDS.BASES;
    }
    if (extension === 'canvas') {
        return TPS_NAVIGATOR_TYPE_IDS.CANVAS;
    }
    if (extension === 'pdf') {
        return TPS_NAVIGATOR_TYPE_IDS.PDFS;
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.IMAGES;
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.AUDIO;
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.VIDEO;
    }
    return null;
}

export function isFileInTpsNavigatorType(app: App, file: TFile, typeId: TpsNavigatorTypeId): boolean {
    return getTpsNavigatorFileTypeId(app, file) === typeId;
}

function toFileTypeRecord(file: TFile, typeId: TpsNavigatorFileTypeId): TpsNavigatorTypeRecord {
    return Object.freeze({
        id: `file:${file.path}`,
        typeId,
        label: file.basename || file.name || file.path,
        sourcePath: file.path,
        entityType: 'file',
        locatorKey: file.path,
        referenceTarget: file.path
    });
}

function compareFileRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return (
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) ||
        left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: 'base' })
    );
}

/** Builds one immutable snapshot from an already-resolved file set without reading file bodies. */
export function buildVaultFileTypesSnapshotFromFiles(app: App, files: readonly TFile[]): TpsNavigatorTypesSnapshot {
    const mutableRecords = new Map<TpsNavigatorTypeId, TpsNavigatorTypeRecord[]>();
    TPS_NAVIGATOR_FILE_TYPES.forEach(descriptor => mutableRecords.set(descriptor.id, []));

    for (const file of files) {
        const typeId = getTpsNavigatorFileTypeId(app, file);
        if (!typeId) {
            continue;
        }
        mutableRecords.get(typeId)?.push(toFileTypeRecord(file, typeId));
    }

    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors: TpsNavigatorTypeDescriptor[] = TPS_NAVIGATOR_FILE_TYPES.map(definition => {
        const records = Object.freeze([...(mutableRecords.get(definition.id) ?? [])].sort(compareFileRecords));
        recordsByType.set(definition.id, records);
        return Object.freeze({ ...definition, count: records.length });
    });

    return Object.freeze({
        availability: 'ready',
        descriptors: Object.freeze(descriptors),
        recordsByType,
        revision: 0
    });
}

/** Builds one immutable snapshot with a single vault scan and no file reads. */
export function buildVaultFileTypesSnapshot(app: App): TpsNavigatorTypesSnapshot {
    const vault = app.vault as unknown as { getFiles?: () => TFile[] };
    const files = typeof vault?.getFiles === 'function' ? vault.getFiles() : [];
    return buildVaultFileTypesSnapshotFromFiles(app, files);
}
