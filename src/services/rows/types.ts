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
    NavigatorRowContextMenuContext,
    NavigatorRowDefinition,
    NavigatorRowProvider,
    NavigatorRowProviderContext,
    NavigatorRowProviderQueryContext,
    NavigatorRowProviderOptions,
    NavigatorRowScope
} from '../../api/types';

export interface NavigatorProvidedRow extends NavigatorRowDefinition {
    /** Added by the registry; providers cannot impersonate one another. */
    providerId: string;
    /** Built-in row-local values used for presentation; intentionally unavailable to external row providers. */
    readonly properties?: Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[]>>;
}

export type NavigatorProvidedRowCandidate = NavigatorRowDefinition;

/** Hard ceiling for all provider contributions to one composed list. */
export const NAVIGATOR_ROW_PROVIDER_MAX_ROWS = 1_000;

export interface NavigatorRowProviderSelection {
    enabledProviderIds: readonly string[];
    optionsByProviderId?: Readonly<Record<string, NavigatorRowProviderOptions>>;
}

export interface NavigatorRowProviderFailure {
    providerId: string;
    error: unknown;
}
