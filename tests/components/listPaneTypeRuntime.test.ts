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

    it('keeps the Type result button at least 44px tall on mobile', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const mobileRule = css.match(/\.notebook-navigator-mobile\s+\.nn-provider-row-open\s*\{([^}]*)\}/u)?.[1];

        expect(mobileRule).toBeDefined();
        expect(mobileRule).toMatch(/min-height:\s*44px\s*;/u);
        expect(mobileRule).toMatch(/align-self:\s*stretch\s*;/u);
    });
});
