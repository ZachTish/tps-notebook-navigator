/* TPS Notebook Navigator - pure mapping from a Types snapshot to standalone rows. */

import type { NavigatorProvidedRow } from './types';
import type { GcmTaskMenuLike } from '../../integrations/gcm/gcmTaskApi';
import type { FilterSearchTokens } from '../../utils/filterSearch';
import { filterSearchMatchesTypeFacet, parseFilterSearchTokens } from '../../utils/filterSearch';
import { foldSearchText } from '../../utils/recordUtils';
import {
    isTpsNavigatorGcmLineTypeId,
    isTpsNavigatorMarkdownTypeId,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';

export interface TypeRecordActivationResult {
    readonly ok: boolean;
    readonly reason?: string;
}

export interface TypeTaskMutationResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly error?: unknown;
}

interface BuildTypeProviderRowsOptions {
    snapshot: TpsNavigatorTypesSnapshot;
    selectedType: TpsNavigatorTypeId;
    searchQuery: string;
    /** Parsed host search. Type facets are evaluated here; note metadata is scoped by allowedSourcePaths. */
    searchTokens?: FilterSearchTokens;
    /** Optional source-note scope after navigation and owning-note metadata filters. */
    allowedSourcePaths?: ReadonlySet<string>;
    /** Standalone Type views show source failures; mixed search sections omit them. */
    includeUnavailableStatus?: boolean;
    activate: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    setTaskCheckbox: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<TypeTaskMutationResult>;
    addTaskContextMenuItems: (menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord) => boolean;
    onActivationFailure: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}

export function buildTypeProviderRows({
    snapshot,
    selectedType,
    searchQuery,
    searchTokens,
    allowedSourcePaths,
    includeUnavailableStatus = true,
    activate,
    setTaskCheckbox,
    addTaskContextMenuItems,
    onActivationFailure
}: BuildTypeProviderRowsOptions): NavigatorProvidedRow[] {
    const tokens = searchTokens ?? (searchQuery.trim() ? parseFilterSearchTokens(searchQuery) : null);
    if (tokens && !filterSearchMatchesTypeFacet(selectedType, tokens)) {
        return [];
    }

    const lineAvailability = snapshot.lineAvailability ?? snapshot.builtinAvailability ?? snapshot.availability;
    if (isTpsNavigatorGcmLineTypeId(selectedType) && lineAvailability !== 'ready') {
        if (!includeUnavailableStatus) {
            return [];
        }
        return [
            {
                providerId: 'tps/entity-types',
                id: `status:${lineAvailability}`,
                kind: 'tps/entity-type-status',
                label: snapshot.lineMessage ?? snapshot.builtinMessage ?? snapshot.message ?? 'Exact-line items are unavailable.',
                sourcePath: 'Types'
            }
        ];
    }
    const markdownAvailability = snapshot.markdownAvailability ?? snapshot.availability;
    if (isTpsNavigatorMarkdownTypeId(selectedType) && markdownAvailability !== 'ready') {
        if (!includeUnavailableStatus) {
            return [];
        }
        return [
            {
                providerId: 'tps/markdown-types',
                id: `status:${markdownAvailability}`,
                kind: 'tps/markdown-type-status',
                label: snapshot.markdownMessage ?? snapshot.message ?? 'Markdown structures are unavailable.',
                sourcePath: 'Types'
            }
        ];
    }

    const queryTerms = tokens ? tokens.nameTokens : searchQuery.trim().split(/\s+/u).map(foldSearchText).filter(Boolean);
    const excludedQueryTerms = tokens?.excludeNameTokens ?? [];

    return (snapshot.recordsByType.get(selectedType) ?? [])
        .filter(record => {
            if (allowedSourcePaths && !allowedSourcePaths.has(record.sourcePath)) {
                return false;
            }
            const haystack = foldSearchText(`${record.label}\n${record.sourcePath}`);
            return queryTerms.every(term => haystack.includes(term)) && excludedQueryTerms.every(term => !haystack.includes(term));
        })
        .map(record => {
            const task = record.lineKind === 'task' ? record.task : undefined;
            const sourceLocation = record.lineNumber
                ? record.lineEndNumber && record.lineEndNumber > record.lineNumber
                    ? `${record.sourcePath} · lines ${record.lineNumber}–${record.lineEndNumber}`
                    : `${record.sourcePath} · line ${record.lineNumber}`
                : record.sourcePath;
            const tooltip = record.lineNumber
                ? record.lineEndNumber && record.lineEndNumber > record.lineNumber
                    ? `Open ${record.sourcePath} at lines ${record.lineNumber}–${record.lineEndNumber}`
                    : `Open ${record.sourcePath} at line ${record.lineNumber}`
                : `Open ${record.sourcePath}`;
            return {
                providerId: 'tps/entity-types',
                id: `${selectedType}:${record.locatorKey}`,
                kind: `tps/entity-type/${record.lineKind ?? record.entityType}`,
                label: record.label,
                secondaryLabel: sourceLocation,
                tooltip,
                sourcePath: record.sourcePath,
                ...(record.lineNumber ? { sourceLineNumber: record.lineNumber - 1 } : {}),
                ...(task
                    ? {
                          indicator: {
                              type: 'checkbox' as const,
                              checked: task.isComplete,
                              marker: task.marker || task.checkbox,
                              ...(task.canMutateCheckbox
                                  ? {
                                        onChange: async (checked: boolean) => {
                                            const result = await setTaskCheckbox(record, checked);
                                            if (!result.ok) {
                                                throw new Error(
                                                    (result.error instanceof Error ? result.error.message : '') ||
                                                        (typeof result.error === 'string' ? result.error : '') ||
                                                        result.reason ||
                                                        'TPS Global Context Menu could not update the task.'
                                                );
                                            }
                                        }
                                    }
                                  : {})
                          }
                      }
                    : {}),
                ...(task?.hasContextMenu
                    ? {
                          contextMenu: (context: {
                              addItem: GcmTaskMenuLike['addItem'];
                              addSeparator: GcmTaskMenuLike['addSeparator'];
                          }) => {
                              addTaskContextMenuItems({ addItem: context.addItem, addSeparator: context.addSeparator }, record);
                          }
                      }
                    : {}),
                activate: async () => {
                    const result = await activate(record);
                    if (!result.ok) {
                        onActivationFailure(record, result);
                    }
                }
            } satisfies NavigatorProvidedRow;
        });
}
