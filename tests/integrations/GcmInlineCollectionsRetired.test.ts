import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as properties from '../../src/integrations/gcm/gcmTaskApi';

describe('retired GCM inline collections', () => {
    it('removes the unmounted collection store, hydration cache and exclusive Markdown scanner', () => {
        for (const file of [
            'integrations/gcm/GcmEntityTypeIndex.ts',
            'integrations/gcm/useGcmEntityTypes.ts',
            'services/types/markdownStructureTypes.ts'
        ]) {
            expect(existsSync(new URL('../../src/' + file, import.meta.url))).toBe(false);
        }
        for (const key of [
            'resolveGcmTaskApi',
            'resolveGcmTaskApiFromPluginApi',
            'resolveGcmTaskLinesApi',
            'resolveGcmTaskCheckboxesApi'
        ]) {
            expect(key in properties).toBe(false);
        }
        const activeHook = readFileSync(new URL('../../src/hooks/useListPaneData.ts', import.meta.url), 'utf8');
        expect(activeHook).not.toContain('useGcmEntityTypes');
    });
});
