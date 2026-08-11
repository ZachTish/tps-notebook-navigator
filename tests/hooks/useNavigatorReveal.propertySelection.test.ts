import { describe, expect, it } from 'vitest';
import { resolvePropertyRevealExpansion } from '../../src/hooks/useNavigatorReveal';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId, normalizePropertyTreeValuePath } from '../../src/utils/propertyTree';
import { PROPERTIES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';

describe('property reveal expansion', () => {
    it('expands a collapsed key and keeps the value row when descendants are enabled', () => {
        const keyNodeId = buildPropertyKeyNodeId('status');
        const valueNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('working'));

        expect(resolvePropertyRevealExpansion(valueNodeId, true, false, new Set())).toEqual({
            targetProperty: valueNodeId,
            expandPropertiesRoot: false,
            propertyKeyNodeIdToExpand: keyNodeId
        });
    });

    it('can keep the collapsed global Properties collection as the all-properties target', () => {
        const valueNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('working'));

        expect(resolvePropertyRevealExpansion(valueNodeId, true, true, new Set())).toEqual({
            targetProperty: PROPERTIES_ROOT_VIRTUAL_FOLDER_ID,
            expandPropertiesRoot: false,
            propertyKeyNodeIdToExpand: null
        });
    });
});
