/* TPS Notebook Navigator - Type-mode calendar and mobile activation isolation. */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    resolveRenderedPropertyGroupingForSelection,
    shouldShowListCreateButton,
    shouldCollapseMobileDrawerForTypeProviderActivation,
    supportsDayPropertyGroupingForSelection,
    supportsCalendarInteractionsForSelection,
    supportsLinePropertyGroupingSourceForSelection,
    supportsListSortAndGroupingForSelection,
    supportsNativeListPresentationForSelection
} from '../../src/components/listPane/typeModeRuntime';
import { ItemType } from '../../src/types';
import { createTpsNavigatorProviderTypeId, TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

describe('Type-mode list runtime behavior', () => {
    it('disables calendar interactions only for Type selections', () => {
        expect(supportsCalendarInteractionsForSelection(ItemType.TYPE)).toBe(false);
        expect(supportsCalendarInteractionsForSelection(ItemType.FOLDER)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(ItemType.TAG)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(ItemType.PROPERTY)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(null)).toBe(true);
    });

    it('collapses the drawer only for Type activations on mobile', () => {
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.TYPE, true)).toBe(true);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.TYPE, false)).toBe(false);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.FOLDER, true)).toBe(false);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(null, true)).toBe(false);
    });

    it('exposes native presentation controls only for file-backed Type selections', () => {
        const providerType = createTpsNavigatorProviderTypeId('example/entities', 'contexts');

        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(true);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.PDFS)).toBe(true);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, providerType)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, null)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.FOLDER, null)).toBe(true);
    });

    it('exposes sort and group controls for every fixed Type but not external providers', () => {
        const providerType = createTpsNavigatorProviderTypeId('example/entities', 'contexts');

        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, providerType)).toBe(false);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, null)).toBe(false);
        expect(supportsListSortAndGroupingForSelection(ItemType.TAG, null)).toBe(true);
    });

    it('offers line-property source only for exact GCM rows or an active mixed structural search', () => {
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.BULLETS, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.HEADINGS, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, false)).toBe(false);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES, false)).toBe(false);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.FOLDER, null, true)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TAG, null, true)).toBe(true);
    });

    it('keeps a latent line source across the mixed-search close and reopen transition while reporting rendered note grouping', () => {
        const configured = 'line-property-day:scheduled' as const;

        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, true)).toBe(configured);
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, false)).toBe('property-day:scheduled');
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, true)).toBe(configured);

        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, configured, false)).toBe(
            'property-day:scheduled'
        );
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, configured, false)).toBe(
            configured
        );
    });

    it('offers day property buckets for standalone line Types and active mixed structural search scopes', () => {
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, false)).toBe(true);
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS, false)).toBe(true);
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES, false)).toBe(false);
        expect(supportsDayPropertyGroupingForSelection(ItemType.PROPERTY, null, true)).toBe(true);
    });

    it('shows the shared desktop/mobile create control only for creatable Type selections', () => {
        expect(shouldShowListCreateButton(ItemType.TYPE, true, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TYPE, false, true)).toBe(false);
        expect(shouldShowListCreateButton(ItemType.FOLDER, false, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TAG, false, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TYPE, true, false)).toBe(false);
    });

    it('binds provider wrappers to their virtual height and keeps every mobile action target at least 44px', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const wrapperRule = css.match(/\.nn-virtual-provider-row\s*\{([^}]*)\}/u)?.[1];
        const openRule = css.match(/\.notebook-navigator-mobile\s+\.nn-provider-row-open\s*\{([^}]*)\}/u)?.[1];
        const checkboxRule = css.match(/\.notebook-navigator-mobile\s+\.nn-provider-row-checkbox\s*\{([^}]*)\}/u)?.[1];
        const moreRule = css.match(/\.notebook-navigator-mobile\s+\.nn-provider-row-more\s*\{([^}]*)\}/u)?.[1];

        expect(wrapperRule).toMatch(/height:\s*var\(--item-height\)\s*;/u);
        expect(openRule).toMatch(/min-height:\s*44px\s*;/u);
        expect(openRule).toMatch(/align-self:\s*stretch\s*;/u);
        for (const rule of [checkboxRule, moreRule]) {
            expect(rule).toMatch(/width:\s*44px\s*;/u);
            expect(rule).toMatch(/height:\s*44px\s*;/u);
            expect(rule).toMatch(/flex-basis:\s*44px\s*;/u);
        }
    });

    it('uses a wrapped compact-card layout for mobile Type task rows', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');

        expect(css).toContain('.notebook-navigator-mobile .nn-provider-row--type {');
        expect(css).toContain('width: calc(100% - 12px);');
        expect(css).toContain('-webkit-line-clamp: 2;');
        expect(css).toContain('overflow-wrap: anywhere;');
        expect(css).toContain('background: color-mix(in srgb, var(--background-secondary) 62%, transparent);');
    });

    it('keeps standalone Type rows on native file chrome while preserving restrained provider controls', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const typeRowRule = css.match(/\.nn-provider-row--type\s*\{([^}]*)\}/u)?.[1];
        const typeOpenRule = css.match(/\.nn-provider-row--type\s+button\.nn-provider-row-open\s*\{([^}]*)\}/u)?.[1];
        const typeSecondaryRule = css.match(/(?:^|\n)\.nn-provider-row--type\s+\.nn-provider-row-secondary\s*\{([^}]*)\}/u)?.[1];
        const selectedTypeSecondaryRule = css.match(/\.nn-file\.nn-selected\s+\.nn-provider-row-secondary\s*\{([^}]*)\}/u)?.[1];
        const mobileCheckboxSlotRule = css.match(
            /\.notebook-navigator-mobile\s+\.nn-provider-row--type\s+\.nn-provider-row-checkbox-slot\s*\{([^}]*)\}/u
        )?.[1];

        expect(typeRowRule).not.toMatch(/display:\s*flex/u);
        expect(typeRowRule).not.toMatch(/padding:/u);
        expect(typeRowRule).not.toMatch(/border(?:-bottom)?:/u);
        expect(typeOpenRule).toMatch(/gap:\s*0\s*;/u);
        expect(typeOpenRule).toMatch(/border-radius:\s*0\s*;/u);
        expect(typeOpenRule).toMatch(/background:\s*transparent\s*;/u);
        expect(typeOpenRule).toMatch(/box-shadow:\s*none\s*;/u);
        expect(typeOpenRule).toMatch(/appearance:\s*none\s*;/u);
        expect(typeSecondaryRule).toMatch(/var\(--nn-theme-file-parent-color\)/u);
        expect(typeSecondaryRule).toMatch(/var\(--nn-file-single-text-line-height\)/u);
        expect(selectedTypeSecondaryRule).toMatch(/var\(--nn-selected-file-parent-color\)/u);
        expect(mobileCheckboxSlotRule).toMatch(/width:\s*44px\s*;/u);
        expect(mobileCheckboxSlotRule).toMatch(/flex-basis:\s*44px\s*;/u);
    });
});
