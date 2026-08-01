/* TPS Notebook Navigator - pure mapping from a Types snapshot to standalone rows. */

import type { NavigatorProvidedRow } from './types';
import type { GcmTaskMenuLike } from '../../integrations/gcm/gcmTaskApi';
import type { TpsNavigatorTypeId, TpsNavigatorTypeRecord, TpsNavigatorTypesSnapshot } from '../../types/navigatorTypes';

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
    activate: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    setTaskCheckbox: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<TypeTaskMutationResult>;
    addTaskContextMenuItems: (menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord) => boolean;
    onActivationFailure: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}

export function buildTypeProviderRows({
    snapshot,
    selectedType,
    searchQuery,
    activate,
    setTaskCheckbox,
    addTaskContextMenuItems,
    onActivationFailure
}: BuildTypeProviderRowsOptions): NavigatorProvidedRow[] {
    const builtinAvailability = snapshot.builtinAvailability ?? snapshot.availability;
    if (builtinAvailability !== 'ready') {
        return [
            {
                providerId: 'tps/entity-types',
                id: `status:${builtinAvailability}`,
                kind: 'tps/entity-type-status',
                label: snapshot.builtinMessage ?? snapshot.message ?? 'Types are unavailable.',
                sourcePath: 'Types'
            }
        ];
    }

    const queryTerms = searchQuery.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);

    return (snapshot.recordsByType.get(selectedType) ?? [])
        .filter(record => {
            if (queryTerms.length === 0) {
                return true;
            }
            const haystack = `${record.label}\n${record.sourcePath}`.toLocaleLowerCase();
            return queryTerms.every(term => haystack.includes(term));
        })
        .map(record => {
            const task = record.lineKind === 'task' ? record.task : undefined;
            return {
                providerId: 'tps/entity-types',
                id: `${selectedType}:${record.locatorKey}`,
                kind: `tps/entity-type/${record.lineKind ?? record.entityType}`,
                label: record.label,
                secondaryLabel: record.lineNumber ? `${record.sourcePath} · line ${record.lineNumber}` : record.sourcePath,
                tooltip: record.lineNumber ? `Open ${record.sourcePath} at line ${record.lineNumber}` : `Open ${record.sourcePath}`,
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
