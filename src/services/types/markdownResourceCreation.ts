/*
 * TPS Notebook Navigator - source-backed creation for built-in line Types.
 *
 * Structural resources are appended atomically to a configured Markdown note.
 * Checkboxes are delegated to GCM so its configured checkbox/status mappings,
 * hidden properties, index notifications, and focus behavior remain canonical.
 */

import { getFrontMatterInfo, parseYaml, TFile, type App } from 'obsidian';
import type { TpsResourceCreationTarget } from '../../settings/types';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypeId } from '../../types/navigatorTypes';
import { createDailyNote, getConfiguredDailyNoteSettings } from '../../utils/dailyNotes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';
import { getMomentApi, resolveDailyNoteLocale } from '../../utils/moment';
import { normalizeOptionalVaultFilePath } from '../../utils/pathUtils';
import { resolveGcmTaskApi, type GcmTaskMutationResultLike } from '../../integrations/gcm/gcmTaskApi';
import { openMarkdownSourceLocation } from './sourceLocation';

export interface TpsResourceCreationTargetSettings {
    target: TpsResourceCreationTarget;
    specificFile: string | null;
}

interface MarkdownResourceScaffold {
    readonly text: string;
    readonly cursorLineOffset: number;
    readonly cursorColumn: number;
}

interface ResourceCreationDescriptor {
    readonly singularLabel: string;
    readonly scaffold: MarkdownResourceScaffold | null;
}

export type TpsResourceCreationFailureReason =
    | 'unsupported-type'
    | 'daily-notes-unavailable'
    | 'active-note-unavailable'
    | 'specific-note-unavailable'
    | 'gcm-task-api-unavailable'
    | 'invalid-task-title'
    | 'write-failed';

export type TpsResourceCreationResult =
    | {
          readonly ok: true;
          readonly file: TFile;
          /** One-based source line when the inserted resource could be resolved. */
          readonly lineNumber: number | null;
      }
    | {
          readonly ok: false;
          readonly reason: TpsResourceCreationFailureReason;
          readonly message: string;
      };

type TpsResourceCreationTargetResolution = TFile | Extract<TpsResourceCreationResult, { ok: false }>;

const RESOURCE_DESCRIPTORS = new Map<TpsNavigatorTypeId, ResourceCreationDescriptor>([
    [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, { singularLabel: 'checkbox', scaffold: null }],
    [TPS_NAVIGATOR_TYPE_IDS.BULLETS, { singularLabel: 'bullet', scaffold: { text: '- ', cursorLineOffset: 0, cursorColumn: 2 } }],
    [TPS_NAVIGATOR_TYPE_IDS.HEADINGS, { singularLabel: 'heading', scaffold: { text: '# ', cursorLineOffset: 0, cursorColumn: 2 } }],
    [
        TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
        { singularLabel: 'code block', scaffold: { text: '```\n\n```', cursorLineOffset: 1, cursorColumn: 0 } }
    ],
    [
        TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
        { singularLabel: 'callout', scaffold: { text: '> [!note]\n> ', cursorLineOffset: 1, cursorColumn: 2 } }
    ],
    [TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES, { singularLabel: 'blockquote', scaffold: { text: '> ', cursorLineOffset: 0, cursorColumn: 2 } }],
    [
        TPS_NAVIGATOR_TYPE_IDS.TABLES,
        {
            singularLabel: 'table',
            scaffold: {
                text: '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |',
                cursorLineOffset: 2,
                cursorColumn: 2
            }
        }
    ],
    [
        TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
        { singularLabel: 'web link', scaffold: { text: '<https://>', cursorLineOffset: 0, cursorColumn: 9 } }
    ]
]);

function hasRegularMarkdownFilename(file: TFile | null): file is TFile {
    return Boolean(file && file.extension.toLocaleLowerCase() === 'md' && !isExcalidrawFile(file));
}

function isWritableMarkdownContent(content: string): boolean {
    try {
        const info = getFrontMatterInfo(content);
        if (!info.exists && /^(?:\uFEFF)?---[ \t]*(?:\r?\n|$)/u.test(content)) {
            return false;
        }
        return !info.exists || !hasExcalidrawFrontmatterFlagValue(parseYaml(info.frontmatter));
    } catch {
        // A target whose frontmatter cannot be verified must not be mutated by a
        // generic resource action. This also protects renamed Excalidraw notes
        // while Obsidian's metadata cache is missing or stale.
        return false;
    }
}

async function isRegularMarkdownFile(app: App, file: TFile | null): Promise<boolean> {
    if (!hasRegularMarkdownFilename(file)) {
        return false;
    }
    if (hasExcalidrawFrontmatterFlagValue(app.metadataCache.getFileCache(file)?.frontmatter)) {
        return false;
    }
    try {
        return isWritableMarkdownContent(await app.vault.cachedRead(file));
    } catch {
        return false;
    }
}

function getDescriptor(typeId: TpsNavigatorTypeId | null): ResourceCreationDescriptor | null {
    return typeId ? (RESOURCE_DESCRIPTORS.get(typeId) ?? null) : null;
}

/** Returns true only for Navigator-owned line Types with an implemented creation flow. */
export function isTpsNavigatorCreatableResourceTypeId(typeId: unknown): typeId is TpsNavigatorTypeId {
    return typeof typeId === 'string' && RESOURCE_DESCRIPTORS.has(typeId as TpsNavigatorTypeId);
}

/** Accessible copy for the Type-aware create button. */
export function getTpsResourceCreationActionLabel(typeId: TpsNavigatorTypeId | null): string | null {
    const descriptor = getDescriptor(typeId);
    return descriptor ? `New ${descriptor.singularLabel}` : null;
}

export interface AppendedMarkdownResource {
    readonly content: string;
    /** Zero-based source line. */
    readonly lineIndex: number;
    readonly column: number;
}

/** Pure append helper used inside Vault.process so the freshest file body always wins. */
export function appendMarkdownResource(content: string, scaffold: MarkdownResourceScaffold): AppendedMarkdownResource {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lineIndex = content.length === 0 ? 0 : content.split(/\r?\n/u).length - (content.endsWith('\n') ? 1 : 0);
    const separator = content.length === 0 || content.endsWith('\n') ? '' : newline;
    const scaffoldText = scaffold.text.replace(/\n/gu, newline);

    return {
        content: `${content}${separator}${scaffoldText}${newline}`,
        lineIndex: lineIndex + scaffold.cursorLineOffset,
        column: scaffold.cursorColumn
    };
}

/** Resolves the configured insertion target without falling back to an unrelated note. */
export async function resolveTpsResourceCreationTarget(
    app: App,
    settings: TpsResourceCreationTargetSettings
): Promise<TpsResourceCreationTargetResolution> {
    if (settings.target === 'active-note') {
        const activeFile = app.workspace.getActiveFile();
        return (await isRegularMarkdownFile(app, activeFile)) && activeFile
            ? activeFile
            : {
                  ok: false,
                  reason: 'active-note-unavailable',
                  message: 'Open a regular Markdown note before creating this resource.'
              };
    }

    if (settings.target === 'specific-note') {
        const path = normalizeOptionalVaultFilePath(settings.specificFile);
        const target = path ? app.vault.getAbstractFileByPath(path) : null;
        return target instanceof TFile && (await isRegularMarkdownFile(app, target))
            ? target
            : {
                  ok: false,
                  reason: 'specific-note-unavailable',
                  message: 'Choose an existing regular Markdown note in TPS Notebook Navigator settings.'
              };
    }

    const momentApi = getMomentApi();
    if (!momentApi || !(await getConfiguredDailyNoteSettings(app))) {
        return {
            ok: false,
            reason: 'daily-notes-unavailable',
            message: "Enable and configure Obsidian's Daily notes core plugin before creating this resource."
        };
    }

    const today = momentApi().locale(resolveDailyNoteLocale(momentApi));
    const dailyNote = await createDailyNote(app, today);
    return (await isRegularMarkdownFile(app, dailyNote)) && dailyNote
        ? dailyNote
        : {
              ok: false,
              reason: 'daily-notes-unavailable',
              message: "Today's daily note could not be created. Check the Daily notes folder and template settings."
          };
}

function isCreationFailure(value: TpsResourceCreationTargetResolution): value is Extract<TpsResourceCreationResult, { ok: false }> {
    return !(value instanceof TFile);
}

/** Creates one built-in line resource and focuses its source location when possible. */
export async function createTpsNavigatorResource(
    app: App,
    typeId: TpsNavigatorTypeId,
    targetSettings: TpsResourceCreationTargetSettings,
    options: {
        taskTitle?: string;
        taskTags?: readonly string[];
        taskFields?: Readonly<Record<string, string>>;
        taskStatus?: string;
    } = {}
): Promise<TpsResourceCreationResult> {
    const descriptor = getDescriptor(typeId);
    if (!descriptor) {
        return { ok: false, reason: 'unsupported-type', message: 'This Type does not support resource creation.' };
    }

    const taskTitle = String(options.taskTitle ?? '')
        .replace(/\s+/gu, ' ')
        .trim();
    const taskApi = typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES ? resolveGcmTaskApi(app) : null;
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES && !taskTitle) {
        return { ok: false, reason: 'invalid-task-title', message: 'Enter a task title.' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES && !taskApi?.create) {
        return {
            ok: false,
            reason: 'gcm-task-api-unavailable',
            message: 'Enable or update TPS Global Context Menu to create checkboxes from Types.'
        };
    }

    const target = await resolveTpsResourceCreationTarget(app, targetSettings);
    if (isCreationFailure(target)) {
        return target;
    }

    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        if (!taskApi?.create) {
            return {
                ok: false,
                reason: 'gcm-task-api-unavailable',
                message: 'Enable or update TPS Global Context Menu to create checkboxes from Types.'
            };
        }
        let result: GcmTaskMutationResultLike;
        try {
            result = await taskApi.create({
                title: taskTitle,
                targetFile: target,
                ...(options.taskTags?.length ? { tags: [...options.taskTags] } : {}),
                ...(options.taskFields && Object.keys(options.taskFields).length > 0 ? { fields: { ...options.taskFields } } : {}),
                ...(options.taskStatus ? { status: options.taskStatus } : {}),
                placement: 'end',
                focus: true,
                notice: true
            });
        } catch {
            return {
                ok: false,
                reason: 'write-failed',
                message: 'TPS Global Context Menu could not create the checkbox.'
            };
        }
        if (!result.ok) {
            return {
                ok: false,
                reason: 'write-failed',
                message: result.error || 'TPS Global Context Menu could not create the checkbox.'
            };
        }
        return { ok: true, file: target, lineNumber: result.task ? result.task.lineNumber + 1 : null };
    }

    if (!descriptor.scaffold) {
        return { ok: false, reason: 'unsupported-type', message: 'This Type does not support resource creation.' };
    }
    const scaffold = descriptor.scaffold;

    let insertedLineIndex = -1;
    let insertedColumn = 0;
    try {
        await app.vault.process(target, content => {
            if (!isWritableMarkdownContent(content)) {
                throw new Error('The target is not a verified regular Markdown note.');
            }
            const insertion = appendMarkdownResource(content, scaffold);
            insertedLineIndex = insertion.lineIndex;
            insertedColumn = insertion.column;
            return insertion.content;
        });
    } catch {
        return { ok: false, reason: 'write-failed', message: 'The resource could not be added to the target note.' };
    }

    if (insertedLineIndex < 0) {
        return { ok: false, reason: 'write-failed', message: 'The resource could not be added to the target note.' };
    }

    const lineNumber = insertedLineIndex + 1;
    await openMarkdownSourceLocation(app, target, lineNumber, insertedColumn);
    return { ok: true, file: target, lineNumber };
}
