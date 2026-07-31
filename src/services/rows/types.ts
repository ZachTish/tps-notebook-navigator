/*
 * TPS Notebook Navigator - provider-backed list rows.
 *
 * Providers return transient display rows. They never masquerade as TFile
 * instances and are intentionally excluded from file selection, drag, rename,
 * and persistence flows.
 */

import type { NavigatorRowDefinition, NavigatorRowProviderOptions } from '../../api/types';

export type {
    NavigatorRowCheckboxIndicator,
    NavigatorRowDefinition,
    NavigatorRowProvider,
    NavigatorRowProviderContext,
    NavigatorRowProviderOptions,
    NavigatorRowScope
} from '../../api/types';

export interface NavigatorProvidedRow extends NavigatorRowDefinition {
    /** Added by the registry; providers cannot impersonate one another. */
    providerId: string;
}

export type NavigatorProvidedRowCandidate = NavigatorRowDefinition;

/** Hard ceiling for one provider's contribution to a single composed list. */
export const NAVIGATOR_ROW_PROVIDER_MAX_ROWS = 1_000;

export interface NavigatorRowProviderSelection {
    enabledProviderIds: readonly string[];
    optionsByProviderId?: Readonly<Record<string, NavigatorRowProviderOptions>>;
}

export interface NavigatorRowProviderFailure {
    providerId: string;
    error: unknown;
}
