/* TPS Notebook Navigator - built-in integration bootstrap boundary. */

import { describe, expect, it } from 'vitest';
import { createBuiltInRowProviderSelection, registerBuiltInRowProviders } from '../../src/integrations/rowProviderIntegrations';
import { GCM_TASK_ROW_PROVIDER_ID } from '../../src/integrations/gcm/GcmTaskRowProvider';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';

describe('built-in row provider integrations', () => {
    it('keeps GCM registration and settings translation behind one bootstrap boundary', () => {
        const registry = new NavigatorRowProviderRegistry();
        registerBuiltInRowProviders(registry);

        expect(registry.get(GCM_TASK_ROW_PROVIDER_ID)).not.toBeNull();
        expect(
            createBuiltInRowProviderSelection({
                tpsDataArchitectureMode: 'legacy',
                tpsGcmTaskRowsEnabled: true,
                tpsGcmTaskRowsIncludeCompleted: true,
                tpsGcmTaskRowsPerNote: 7
            })
        ).toEqual({
            enabledProviderIds: [GCM_TASK_ROW_PROVIDER_ID],
            optionsByProviderId: {
                [GCM_TASK_ROW_PROVIDER_ID]: {
                    enabled: true,
                    includeCompleted: true,
                    maxRowsPerFile: 7
                }
            }
        });
    });

    it('suppresses virtual GCM rows in native-record mode', () => {
        expect(
            createBuiltInRowProviderSelection({
                tpsDataArchitectureMode: 'native-records',
                tpsGcmTaskRowsEnabled: true,
                tpsGcmTaskRowsIncludeCompleted: true,
                tpsGcmTaskRowsPerNote: 7
            }).enabledProviderIds
        ).toEqual([]);
    });
});
