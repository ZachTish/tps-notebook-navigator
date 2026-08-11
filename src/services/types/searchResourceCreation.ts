/* TPS Notebook Navigator - strict creation plans derived from Filter Search. */

import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypeId } from '../../types/navigatorTypes';
import { parseFilterSearchTokens } from '../../utils/filterSearch';
import type { PropertySearchToken } from '../../utils/filterSearchTypes';
import { isTpsNavigatorCreatableFileTypeId } from './fileResourceCreation';
import { isTpsNavigatorCreatableResourceTypeId } from './markdownResourceCreation';

export interface SearchResourceCreationPlan {
    readonly ok: true;
    readonly typeId: TpsNavigatorTypeId;
    readonly tags: readonly string[];
    readonly fields: Readonly<Record<string, string>>;
    readonly status?: string;
}

export interface SearchResourceCreationBlock {
    readonly ok: false;
    readonly reason: string;
}

export type SearchResourceCreationResolution = SearchResourceCreationPlan | SearchResourceCreationBlock;

const AMBIGUOUS_FILTER_REASON =
    'New item unavailable: this search contains text, exclusions, OR branches, or source constraints that cannot be applied deterministically.';
const UNSUPPORTED_PROPERTY_KEYS = new Set(['checkbox', 'marker', 'tags', 'title']);

function resolveTaskFields(
    propertyTokens: readonly PropertySearchToken[]
): { readonly ok: true; readonly fields: Readonly<Record<string, string>>; readonly status?: string } | SearchResourceCreationBlock {
    const fields: Record<string, string> = Object.create(null) as Record<string, string>;
    let status: string | undefined;
    for (const token of propertyTokens) {
        if (token.value === null || token.value.length === 0 || UNSUPPORTED_PROPERTY_KEYS.has(token.key)) {
            return { ok: false, reason: 'New item unavailable: this search contains a property that cannot be assigned safely.' };
        }
        if (token.key === 'status') {
            if (status !== undefined && status !== token.value) {
                return { ok: false, reason: 'New item unavailable: this search requires conflicting task statuses.' };
            }
            status = token.value;
            continue;
        }
        if (fields[token.key] !== undefined && fields[token.key] !== token.value) {
            return { ok: false, reason: `New item unavailable: this search requires conflicting values for ${token.key}.` };
        }
        fields[token.key] = token.value;
    }
    return { ok: true, fields: Object.freeze(fields), ...(status === undefined ? {} : { status }) };
}

/**
 * A nonempty search may create only when one supported Type and every criterion can be written to the new item.
 * This deliberately rejects guesses: the created resource must be guaranteed to satisfy the current query.
 */
export function resolveSearchResourceCreation(query: string): SearchResourceCreationResolution {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return { ok: false, reason: 'New item unavailable: the search is empty.' };
    }

    const tokens = parseFilterSearchTokens(trimmedQuery);
    if (tokens.typeTokens.length !== 1 || tokens.excludeTypeTokens.length > 0) {
        return { ok: false, reason: 'New item unavailable: this search must select exactly one supported Type.' };
    }
    const typeId = tokens.typeTokens[0];
    if (!isTpsNavigatorCreatableResourceTypeId(typeId) && !isTpsNavigatorCreatableFileTypeId(typeId)) {
        return { ok: false, reason: 'New item unavailable: the selected Type does not support creation.' };
    }

    const hasUnsupportedCriteria =
        tokens.nameTokens.length > 0 ||
        tokens.excludeNameTokens.length > 0 ||
        tokens.excludeTagTokens.length > 0 ||
        tokens.excludePropertyTokens.length > 0 ||
        tokens.folderTokens.length > 0 ||
        tokens.excludeFolderTokens.length > 0 ||
        tokens.extensionTokens.length > 0 ||
        tokens.excludeExtensionTokens.length > 0 ||
        tokens.dateRanges.length > 0 ||
        tokens.excludeDateRanges.length > 0 ||
        tokens.requireUnfinishedTasks ||
        tokens.excludeUnfinishedTasks ||
        tokens.requireTagged ||
        tokens.includeUntagged ||
        tokens.excludeTagged ||
        tokens.expression.some(
            token =>
                token.kind === 'notTag' ||
                token.kind === 'notProperty' ||
                token.kind === 'requireTagged' ||
                token.kind === 'untagged' ||
                (token.kind === 'operator' && token.operator === 'OR')
        );
    if (hasUnsupportedCriteria) {
        return { ok: false, reason: AMBIGUOUS_FILTER_REASON };
    }

    const tags = Object.freeze([...new Set(tokens.includedTagTokens)]);
    if (typeId !== TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        if (tags.length > 0 || tokens.propertyTokens.length > 0) {
            return { ok: false, reason: 'New item unavailable: this Type cannot safely apply the required tags or properties.' };
        }
        return { ok: true, typeId, tags, fields: Object.freeze({}) };
    }

    const taskFields = resolveTaskFields(tokens.propertyTokens);
    if (!taskFields.ok) {
        return taskFields;
    }
    return {
        ok: true,
        typeId,
        tags,
        fields: taskFields.fields,
        ...(taskFields.status === undefined ? {} : { status: taskFields.status })
    };
}
