/* TPS Notebook Navigator - pure mapping from a Types snapshot to standalone rows. */

import type { NavigatorProvidedRow } from './types';
import type { TpsNavigatorTypeId, TpsNavigatorTypeRecord, TpsNavigatorTypesSnapshot } from '../../types/navigatorTypes';

export interface TypeRecordActivationResult {
    readonly ok: boolean;
    readonly reason?: string;
}

interface BuildTypeProviderRowsOptions {
    snapshot: TpsNavigatorTypesSnapshot;
    selectedType: TpsNavigatorTypeId;
    searchQuery: string;
    activate: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    onActivationFailure: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}

export function buildTypeProviderRows({
    snapshot,
    selectedType,
    searchQuery,
    activate,
    onActivationFailure
}: BuildTypeProviderRowsOptions): NavigatorProvidedRow[] {
    if (snapshot.availability !== 'ready') {
        return [
            {
                providerId: 'tps/entity-types',
                id: `status:${snapshot.availability}`,
                kind: 'tps/entity-type-status',
                label: snapshot.message ?? 'Types are unavailable.',
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
        .map(record => ({
            providerId: 'tps/entity-types',
            id: `${selectedType}:${record.locatorKey}`,
            kind: `tps/entity-type/${record.lineKind ?? record.entityType}`,
            label: record.label,
            secondaryLabel: record.lineNumber ? `${record.sourcePath} · line ${record.lineNumber}` : record.sourcePath,
            tooltip: record.lineNumber ? `Open ${record.sourcePath} at line ${record.lineNumber}` : `Open ${record.sourcePath}`,
            sourcePath: record.sourcePath,
            ...(record.lineNumber ? { sourceLineNumber: record.lineNumber - 1 } : {}),
            activate: async () => {
                const result = await activate(record);
                if (!result.ok) {
                    onActivationFailure(record, result);
                }
            }
        }));
}
