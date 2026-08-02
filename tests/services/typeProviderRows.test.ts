import { describe, expect, it, vi } from 'vitest';
import { buildTypeProviderRows, type TypeRecordActivationResult } from '../../src/services/rows/typeProviderRows';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypeRecord, type TpsNavigatorTypesSnapshot } from '../../src/types/navigatorTypes';

const selectedLineTypeId = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;

function createRecord(overrides: Partial<TpsNavigatorTypeRecord> = {}): TpsNavigatorTypeRecord {
    return {
        id: 'project-one',
        typeId: selectedLineTypeId,
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
        recordsByType: new Map([[selectedLineTypeId, records]]),
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
    setTaskCheckbox?: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<{ ok: boolean; reason?: string }>;
    addTaskContextMenuItems?: (menu: { addItem: () => unknown; addSeparator: () => unknown }, record: TpsNavigatorTypeRecord) => boolean;
    onActivationFailure?: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}) {
    return buildTypeProviderRows({
        snapshot: createSnapshot(options?.records ?? [], options?.availability, options?.message),
        selectedType: selectedLineTypeId,
        searchQuery: options?.searchQuery ?? '',
        activate: options?.activate ?? (async () => ({ ok: true })),
        setTaskCheckbox: options?.setTaskCheckbox ?? (async () => ({ ok: true })),
        addTaskContextMenuItems: options?.addTaskContextMenuItems ?? (() => true),
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

    it('keeps built-in GCM status independent when an external provider makes the aggregate catalog ready', () => {
        const snapshot = createSnapshot([], 'ready');
        snapshot.builtinAvailability = 'unavailable';
        snapshot.builtinMessage = 'GCM is unavailable.';

        const rows = buildTypeProviderRows({
            snapshot,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows[0]).toMatchObject({ id: 'status:unavailable', label: 'GCM is unavailable.' });
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
            id: `${selectedLineTypeId}:${note.locatorKey}`,
            kind: 'tps/entity-type/note',
            label: 'Project one',
            secondaryLabel: 'Projects/One.md',
            tooltip: 'Open Projects/One.md',
            sourcePath: 'Projects/One.md'
        });
        expect(rows[0]).not.toHaveProperty('sourceLineNumber');
        expect(rows[1]).toMatchObject({
            id: `${selectedLineTypeId}:${checkbox.locatorKey}`,
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
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows).toEqual([]);
    });

    it('decorates hydrated checkbox records with live GCM controls', async () => {
        const task = createRecord({
            id: 'task-one',
            label: 'Ship it',
            sourcePath: 'Tasks/Today.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 4,
            locatorKey: 'block:task-one',
            task: {
                lineNumber: 3,
                rawLine: '- [ ] Ship it',
                title: 'Ship it',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                canMutateCheckbox: true,
                hasContextMenu: true
            }
        });
        const setTaskCheckbox = vi.fn(async () => ({ ok: true }) as const);
        const addTaskContextMenuItems = vi.fn(() => true);
        const rows = buildRows({ records: [task], setTaskCheckbox, addTaskContextMenuItems });

        expect(rows[0].indicator).toMatchObject({ type: 'checkbox', checked: false, marker: ' ' });
        await rows[0].indicator?.onChange?.(true);
        expect(setTaskCheckbox).toHaveBeenCalledWith(task, true);

        const menu = { addItem: vi.fn(), addSeparator: vi.fn() };
        rows[0].contextMenu?.({
            providerId: rows[0].providerId,
            rowId: rows[0].id,
            kind: rows[0].kind,
            sourcePath: rows[0].sourcePath,
            sourceLineNumber: rows[0].sourceLineNumber,
            ...menu
        });
        expect(addTaskContextMenuItems).toHaveBeenCalledWith(menu, task);
    });

    it('keeps non-task and unhydrated task records open-only', () => {
        const bullet = createRecord({ entityType: 'block', lineKind: 'bullet', lineNumber: 2 });
        const unhydratedTask = createRecord({
            id: 'task',
            locatorKey: 'block:task',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 3
        });

        const rows = buildRows({ records: [bullet, unhydratedTask] });
        expect(rows).toHaveLength(2);
        rows.forEach(row => {
            expect(row.indicator).toBeUndefined();
            expect(row.contextMenu).toBeUndefined();
        });
    });

    it('surfaces a task mutation failure so the shared optimistic checkbox UI can roll back', async () => {
        const task = createRecord({
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 2,
            task: {
                lineNumber: 1,
                rawLine: '- [ ] Ship it',
                title: 'Ship it',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                canMutateCheckbox: true,
                hasContextMenu: false
            }
        });
        const rows = buildRows({
            records: [task],
            setTaskCheckbox: async () => ({ ok: false, reason: 'Task moved' })
        });

        await expect(rows[0].indicator?.onChange?.(true)).rejects.toThrow('Task moved');
    });
});
