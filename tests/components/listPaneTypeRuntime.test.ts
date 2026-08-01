/* TPS Notebook Navigator - Type-mode calendar and mobile activation isolation. */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    shouldCollapseMobileDrawerForTypeProviderActivation,
    supportsCalendarInteractionsForSelection
} from '../../src/components/listPane/typeModeRuntime';
import { ItemType } from '../../src/types';

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
});
