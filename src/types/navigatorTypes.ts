/*
 * TPS Notebook Navigator - descriptor model for the first-class Types source.
 *
 * The navigation layer depends on these neutral descriptors, not on GCM.
 * Integrations may resolve records for any descriptor without teaching core
 * navigation about a specific entity index implementation.
 */

export const TPS_NAVIGATOR_TYPE_IDS = {
    NOTES: 'entity:note',
    CHECKBOXES: 'structural:task',
    BULLETS: 'structural:bullet',
    HEADINGS: 'structural:heading'
} as const;

export type TpsNavigatorStructuralTypeId = (typeof TPS_NAVIGATOR_TYPE_IDS)[keyof typeof TPS_NAVIGATOR_TYPE_IDS];
export type TpsNavigatorKindTypeId = `kind:${string}`;
export type TpsNavigatorTypeId = TpsNavigatorStructuralTypeId | TpsNavigatorKindTypeId;
export type TpsNavigatorTypeCategory = 'structure' | 'kind';

export interface TpsNavigatorTypeDescriptor {
    id: TpsNavigatorTypeId;
    label: string;
    icon: string;
    category: TpsNavigatorTypeCategory;
    count: number;
}

export interface TpsNavigatorTypeRecord {
    id: string;
    typeId: TpsNavigatorTypeId;
    label: string;
    sourcePath: string;
    entityType: 'note' | 'block';
    lineKind?: 'task' | 'bullet' | 'heading';
    /** One-based source line supplied by the entity index. */
    lineNumber?: number;
    locatorKey: string;
    referenceTarget: string;
    /** Live task state, present only when GCM can hydrate this task line exactly. */
    task?: TpsNavigatorTypeTaskState;
    checked?: boolean;
}

export interface TpsNavigatorTypeTaskState {
    /** Zero-based source line used by GCM's task API. */
    lineNumber: number;
    rawLine: string;
    title: string;
    checkbox: string;
    marker: string;
    status: string;
    isComplete: boolean;
    canMutateCheckbox: boolean;
    hasContextMenu: boolean;
}

export type TpsNavigatorTypesAvailability = 'loading' | 'ready' | 'unavailable' | 'error';

export interface TpsNavigatorTypesSnapshot {
    availability: TpsNavigatorTypesAvailability;
    descriptors: readonly TpsNavigatorTypeDescriptor[];
    recordsByType: ReadonlyMap<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>;
    revision: number;
    message?: string;
}

export const TPS_NAVIGATOR_STRUCTURAL_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    {
        id: TPS_NAVIGATOR_TYPE_IDS.NOTES,
        label: 'Notes',
        icon: 'lucide-file-text',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
        label: 'Checkboxes',
        icon: 'lucide-square-check-big',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.BULLETS,
        label: 'Bullets',
        icon: 'lucide-list',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
        label: 'Headings',
        icon: 'lucide-heading',
        category: 'structure'
    }
]);

export function createTpsNavigatorKindTypeId(kind: string): TpsNavigatorKindTypeId | null {
    const normalized = String(kind ?? '').trim();
    if (!normalized) {
        return null;
    }
    return `kind:${encodeURIComponent(normalized)}`;
}

export function getTpsNavigatorKindValue(typeId: string): string | null {
    if (!typeId.startsWith('kind:')) {
        return null;
    }
    try {
        const value = decodeURIComponent(typeId.slice('kind:'.length)).trim();
        return value || null;
    } catch {
        return null;
    }
}

export function isTpsNavigatorTypeId(value: unknown): value is TpsNavigatorTypeId {
    if (typeof value !== 'string') {
        return false;
    }
    if ((Object.values(TPS_NAVIGATOR_TYPE_IDS) as string[]).includes(value)) {
        return true;
    }
    return getTpsNavigatorKindValue(value) !== null;
}

/** Applies Navigator visibility rules to a raw entity-index snapshot. */
export function filterTpsNavigatorTypesSnapshot(
    snapshot: TpsNavigatorTypesSnapshot,
    visibleSourcePaths: ReadonlySet<string>
): TpsNavigatorTypesSnapshot {
    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors = snapshot.descriptors.map(descriptor => {
        const records = (snapshot.recordsByType.get(descriptor.id) ?? []).filter(record => visibleSourcePaths.has(record.sourcePath));
        recordsByType.set(descriptor.id, records);
        return records.length === descriptor.count ? descriptor : { ...descriptor, count: records.length };
    });

    return {
        ...snapshot,
        descriptors,
        recordsByType
    };
}
