import { describe, expect, it, vi } from 'vitest';
import { buildTypeProviderRows, type TypeRecordActivationResult } from '../../src/services/rows/typeProviderRows';
import {
    createTpsNavigatorKindTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';

const projectTypeId = createTpsNavigatorKindTypeId('project')!;

function createRecord(overrides: Partial<TpsNavigatorTypeRecord> = {}): TpsNavigatorTypeRecord {
    return {
        id: 'project-one',
        typeId: projectTypeId,
        label: 'Project one',
        sourcePath: 'Projects/One.md',
        entityType: 'note',
        locatorKey: 'note:Projects/One.md',
        referenceTarget: '[[Projects/One]]',
        ...overrides
    };
}

function createSnapshot(
    records: readonly TpsNavigatorTypeRecord[],
    availability: TpsNavigatorTypesSnapshot['availability'] = 'ready',
    message?: string
): TpsNavigatorTypesSnapshot {
    return {
        availability,
        descriptors: [],
        recordsByType: new Map([[projectTypeId, records]]),
        revision: 3,
        ...(message ? { message } : {})
    };
}

function buildRows(options?: {
    records?: readonly TpsNavigatorTypeRecord[];
    availability?: TpsNavigatorTypesSnapshot['availability'];
    message?: string;
    searchQuery?: string;
    activate?: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    onActivationFailure?: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}) {
    return buildTypeProviderRows({
        snapshot: createSnapshot(options?.records ?? [], options?.availability, options?.message),
        selectedType: projectTypeId,
        searchQuery: options?.searchQuery ?? '',
        activate: options?.activate ?? (async () => ({ ok: true })),
        onActivationFailure: options?.onActivationFailure ?? (() => undefined)
    });
}

describe('buildTypeProviderRows', () => {
    it.each([
        ['loading', 'Loading entity index…'],
        ['unavailable', 'Types are unavailable.'],
        ['error', 'Entity index failed']
    ] as const)('maps a %s snapshot to one standalone status row', (availability, message) => {
        const rows = buildRows({ availability, message });

        expect(rows).toEqual([
            {
                providerId: 'tps/entity-types',
                id: `status:${availability}`,
                kind: 'tps/entity-type-status',
                label: message,
                sourcePath: 'Types'
            }
        ]);
    });

    it('maps note records to path-only rows and one-based line records to zero-based source positions', () => {
        const note = createRecord();
        const checkbox = createRecord({
            id: 'task-one',
            label: 'Ship the release',
            sourcePath: 'Tasks/Today.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 9,
            locatorKey: 'block:Tasks/Today.md:^task-one',
            referenceTarget: '[[Tasks/Today#^task-one]]'
        });

        const rows = buildRows({ records: [note, checkbox] });

        expect(rows[0]).toMatchObject({
            id: `${projectTypeId}:${note.locatorKey}`,
            kind: 'tps/entity-type/note',
            label: 'Project one',
            secondaryLabel: 'Projects/One.md',
            tooltip: 'Open Projects/One.md',
            sourcePath: 'Projects/One.md'
        });
        expect(rows[0]).not.toHaveProperty('sourceLineNumber');
        expect(rows[1]).toMatchObject({
            id: `${projectTypeId}:${checkbox.locatorKey}`,
            kind: 'tps/entity-type/task',
            label: 'Ship the release',
            secondaryLabel: 'Tasks/Today.md · line 9',
            tooltip: 'Open Tasks/Today.md at line 9',
            sourcePath: 'Tasks/Today.md',
            sourceLineNumber: 8
        });
    });

    it('requires every case-insensitive search term while matching across both label and source path', () => {
        const matching = createRecord({ label: 'Buy weekly supplies', sourcePath: 'Shopping/Home.md' });
        const missingTerm = createRecord({
            id: 'work',
            label: 'Buy office supplies',
            sourcePath: 'Shopping/Work.md',
            locatorKey: 'note:Shopping/Work.md'
        });

        const rows = buildRows({ records: [matching, missingTerm], searchQuery: '  BUY   home  ' });

        expect(rows.map(row => row.label)).toEqual(['Buy weekly supplies']);
    });

    it('reports failed activation with the exact record and result but ignores successful activation', async () => {
        const failedRecord = createRecord({ id: 'failed' });
        const successfulRecord = createRecord({ id: 'successful', locatorKey: 'note:successful' });
        const failure = { ok: false, reason: 'Line moved' } as const;
        const activate = vi.fn(async (record: TpsNavigatorTypeRecord) =>
            record.id === failedRecord.id ? failure : ({ ok: true } as const)
        );
        const onActivationFailure = vi.fn();
        const rows = buildRows({ records: [failedRecord, successfulRecord], activate, onActivationFailure });

        await rows[0].activate?.();
        await rows[1].activate?.();

        expect(activate).toHaveBeenNthCalledWith(1, failedRecord);
        expect(activate).toHaveBeenNthCalledWith(2, successfulRecord);
        expect(onActivationFailure).toHaveBeenCalledOnce();
        expect(onActivationFailure).toHaveBeenCalledWith(failedRecord, failure);
    });

    it('returns no rows when the selected ready type has no records', () => {
        const rows = buildTypeProviderRows({
            snapshot: createSnapshot([createRecord()]),
            selectedType: TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            onActivationFailure: () => undefined
        });

        expect(rows).toEqual([]);
    });
});
