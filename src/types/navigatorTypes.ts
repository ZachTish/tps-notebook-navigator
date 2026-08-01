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
export type TpsNavigatorProviderTypeId = `provider:${string}:${string}`;
export type TpsNavigatorTypeId = TpsNavigatorStructuralTypeId | TpsNavigatorKindTypeId | TpsNavigatorProviderTypeId;
export type TpsNavigatorTypeCategory = 'structure' | 'kind';

export const TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE = 'builtin';
export const TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
export const TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;

export interface TpsNavigatorTypeDescriptor {
    id: TpsNavigatorTypeId;
    label: string;
    icon: string;
    category: TpsNavigatorTypeCategory;
    count: number;
    /** External collections omit counts because their rows are transient and search/visibility scoped. */
    showCount?: boolean;
    /** Present only for externally registered top-level collections. */
    providerId?: string;
    /** Provider-local collection ID, present only for external collections. */
    providerCollectionId?: string;
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
    /** Source keys whose current missing descriptors are authoritative. */
    authoritativeSourceKeys?: ReadonlySet<string>;
    /** Original GCM source state, independent from healthy external providers. */
    builtinAvailability?: TpsNavigatorTypesAvailability;
    builtinMessage?: string;
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

export interface TpsNavigatorProviderTypeIdentity {
    providerId: string;
    collectionId: string;
}

export function getTpsNavigatorProviderSourceKey(providerId: string): string {
    return `provider:${providerId}`;
}

export function createTpsNavigatorProviderTypeId(providerId: string, collectionId: string): TpsNavigatorProviderTypeId | null {
    const normalizedProviderId = String(providerId ?? '').trim();
    const normalizedCollectionId = String(collectionId ?? '').trim();
    if (
        normalizedProviderId.length > 128 ||
        !TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN.test(normalizedProviderId) ||
        !TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN.test(normalizedCollectionId)
    ) {
        return null;
    }
    return `provider:${encodeURIComponent(normalizedProviderId)}:${encodeURIComponent(normalizedCollectionId)}`;
}

export function parseTpsNavigatorProviderTypeId(typeId: string): TpsNavigatorProviderTypeIdentity | null {
    if (!typeId.startsWith('provider:')) {
        return null;
    }
    const encodedParts = typeId.slice('provider:'.length).split(':');
    if (encodedParts.length !== 2) {
        return null;
    }
    try {
        const providerId = decodeURIComponent(encodedParts[0]);
        const collectionId = decodeURIComponent(encodedParts[1]);
        const canonical = createTpsNavigatorProviderTypeId(providerId, collectionId);
        return canonical === typeId ? { providerId, collectionId } : null;
    } catch {
        return null;
    }
}

export function getTpsNavigatorTypeSourceKey(typeId: TpsNavigatorTypeId): string {
    const providerIdentity = parseTpsNavigatorProviderTypeId(typeId);
    return providerIdentity ? getTpsNavigatorProviderSourceKey(providerIdentity.providerId) : TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE;
}

/**
 * Returns true only when the source that owns a missing Type has produced an
 * authoritative catalog. Unknown provider IDs remain provisional so restored
 * selections survive cross-plugin load order.
 */
export function isTpsNavigatorTypeAuthoritativelyMissing(
    snapshot: Pick<TpsNavigatorTypesSnapshot, 'availability' | 'descriptors' | 'authoritativeSourceKeys'>,
    typeId: TpsNavigatorTypeId
): boolean {
    if (snapshot.descriptors.some(descriptor => descriptor.id === typeId)) {
        return false;
    }
    if (snapshot.authoritativeSourceKeys) {
        return snapshot.authoritativeSourceKeys.has(getTpsNavigatorTypeSourceKey(typeId));
    }
    return snapshot.availability === 'ready';
}

export function isTpsNavigatorTypeId(value: unknown): value is TpsNavigatorTypeId {
    if (typeof value !== 'string') {
        return false;
    }
    if ((Object.values(TPS_NAVIGATOR_TYPE_IDS) as string[]).includes(value)) {
        return true;
    }
    return getTpsNavigatorKindValue(value) !== null || parseTpsNavigatorProviderTypeId(value) !== null;
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
        if (descriptor.showCount === false) {
            return descriptor;
        }
        return records.length === descriptor.count ? descriptor : { ...descriptor, count: records.length };
    });

    return {
        ...snapshot,
        descriptors,
        recordsByType
    };
}
