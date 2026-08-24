/* TPS Notebook Navigator - single bootstrap boundary for built-in row integrations. */

import type { NotebookNavigatorSettings } from '../settings/types';
import type { NavigatorRowProviderRegistry } from '../services/rows/NavigatorRowProviderRegistry';
import type { NavigatorRowProviderSelection } from '../services/rows/types';
import { createGcmTaskRowProviderSelection, GcmTaskRowProvider } from './gcm/GcmTaskRowProvider';

type BuiltInRowProviderSettings = Pick<
    NotebookNavigatorSettings,
    'tpsDataArchitectureMode' | 'tpsGcmTaskRowsEnabled' | 'tpsGcmTaskRowsIncludeCompleted' | 'tpsGcmTaskRowsPerNote'
>;

export function registerBuiltInRowProviders(registry: NavigatorRowProviderRegistry): void {
    registry.register(new GcmTaskRowProvider());
}

export function createBuiltInRowProviderSelection(settings: BuiltInRowProviderSettings): NavigatorRowProviderSelection {
    return createGcmTaskRowProviderSelection({
        enabled: settings.tpsDataArchitectureMode !== 'native-records' && settings.tpsGcmTaskRowsEnabled,
        includeCompleted: settings.tpsGcmTaskRowsIncludeCompleted,
        maxRowsPerFile: settings.tpsGcmTaskRowsPerNote
    });
}
