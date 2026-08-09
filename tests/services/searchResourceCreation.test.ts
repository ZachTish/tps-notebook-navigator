import { describe, expect, it } from 'vitest';
import { resolveSearchResourceCreation } from '../../src/services/types/searchResourceCreation';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

describe('search-backed resource creation', () => {
    it('builds one matching task from positive AND tags', () => {
        expect(resolveSearchResourceCreation('#hca AND #idea type:structural:task')).toEqual({
            ok: true,
            typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            tags: ['hca', 'idea'],
            fields: {}
        });
    });

    it('maps exact task properties into canonical status and inline fields', () => {
        expect(resolveSearchResourceCreation('#hca AND .status=todo AND .priority=high type:structural:task')).toEqual({
            ok: true,
            typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            tags: ['hca'],
            fields: { priority: 'high' },
            status: 'todo'
        });
    });

    it('allows a Type-only query when its creation flow needs no inferred metadata', () => {
        expect(resolveSearchResourceCreation('type:structural:bullet')).toMatchObject({
            ok: true,
            typeId: TPS_NAVIGATOR_TYPE_IDS.BULLETS,
            tags: [],
            fields: {}
        });
        expect(resolveSearchResourceCreation('type:file:canvas')).toMatchObject({
            ok: true,
            typeId: TPS_NAVIGATOR_TYPE_IDS.CANVAS,
            tags: [],
            fields: {}
        });
    });

    it.each([
        '#hca OR #idea type:structural:task',
        '#hca -#blocked type:structural:task',
        '-# type:structural:task',
        'open #hca type:structural:task',
        '#hca folder:projects type:structural:task',
        '#hca type:structural:task type:structural:heading',
        '#hca',
        '.priority type:structural:task',
        '#hca type:structural:bullet',
        '#hca type:file:canvas'
    ])('rejects a search whose new item cannot be guaranteed to match: %s', query => {
        expect(resolveSearchResourceCreation(query)).toMatchObject({ ok: false });
    });
});
