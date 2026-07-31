/*
 * TPS Notebook Navigator - built-in optional row providers.
 */

import { registerBuiltInRowProviders } from '../../integrations/rowProviderIntegrations';
import { NavigatorRowProviderRegistry } from './NavigatorRowProviderRegistry';

export const navigatorRowProviderRegistry = new NavigatorRowProviderRegistry();

registerBuiltInRowProviders(navigatorRowProviderRegistry);
