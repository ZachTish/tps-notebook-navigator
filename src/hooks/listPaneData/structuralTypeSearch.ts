/* TPS Notebook Navigator - pure helpers for additive file and source-backed Type search. */

import type { App, TFile } from 'obsidian';
import type { FilterSearchTokens } from '../../utils/filterSearch';
import { filterSearchMatchesTypeFacet } from '../../utils/filterSearch';
import type { TpsNavigatorLineTypeId, TpsNavigatorTypeId } from '../../types/navigatorTypes';
import { TPS_NAVIGATOR_LINE_TYPES, isTpsNavigatorFileTypeId, isTpsNavigatorStructuralTypeId } from '../../types/navigatorTypes';
import { isFileInTpsNavigatorType } from '../../services/types/vaultFileTypes';

/**
 * Name terms belong to an individual structural row, while tag/property/date/folder/task terms
 * describe its owning note. Type facets are evaluated against the row collection itself.
 */
export function getStructuralTypeSourceSearchTokens(tokens: FilterSearchTokens): FilterSearchTokens {
    const hasInclusions =
        tokens.tagTokens.length > 0 ||
        tokens.propertyTokens.length > 0 ||
        tokens.folderTokens.length > 0 ||
        tokens.extensionTokens.length > 0 ||
        tokens.dateRanges.length > 0 ||
        tokens.requireTagged ||
        tokens.requireUnfinishedTasks ||
        (tokens.mode === 'tag' && tokens.expression.length > 0);

    return {
        ...tokens,
        hasInclusions,
        nameTokens: [],
        excludeNameTokens: [],
        typeTokens: [],
        excludeTypeTokens: []
    };
}

/** Applies only file-backed Type facets to native file results; line-backed facets are rendered separately. */
export function fileMatchesStructuralTypeSearch(app: App, file: TFile, tokens: FilterSearchTokens): boolean {
    const matchingFileTypes = tokens.typeTokens.filter(isTpsNavigatorFileTypeId);
    const hasPositiveMatch =
        tokens.typeTokens.length === 0 || matchingFileTypes.some(typeId => isFileInTpsNavigatorType(app, file, typeId));
    if (!hasPositiveMatch) {
        return false;
    }

    return !tokens.excludeTypeTokens.filter(isTpsNavigatorFileTypeId).some(typeId => isFileInTpsNavigatorType(app, file, typeId));
}

/** Stable built-in line collections included by the current Type facet. */
export function getStructuralTypeSearchCollections(tokens: FilterSearchTokens): TpsNavigatorLineTypeId[] {
    return TPS_NAVIGATOR_LINE_TYPES.map(descriptor => descriptor.id as TpsNavigatorLineTypeId).filter(typeId =>
        filterSearchMatchesTypeFacet(typeId, tokens)
    );
}

/** Fixed Type selections become an all-Type result surface while internal search is active. */
export function shouldUseGlobalTypeSearch({
    enabled,
    isTypeSelection,
    selectedType,
    hasSearchQuery,
    useOmnisearch
}: {
    enabled: boolean;
    isTypeSelection: boolean;
    selectedType: TpsNavigatorTypeId | null;
    hasSearchQuery: boolean;
    useOmnisearch: boolean;
}): boolean {
    return enabled && isTypeSelection && isTpsNavigatorStructuralTypeId(selectedType) && hasSearchQuery && !useOmnisearch;
}
