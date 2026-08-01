/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from 'vitest';
import { getTpsNavigatorTypeTitleData } from '../../src/hooks/useListPaneTitle';

describe('getTpsNavigatorTypeTitleData', () => {
    it('uses the structural descriptor label and icon', () => {
        expect(getTpsNavigatorTypeTitleData('structural:task')).toEqual({
            label: 'Checkboxes',
            icon: 'lucide-square-check-big'
        });
    });

    it('decodes a dynamic Kind label', () => {
        expect(getTpsNavigatorTypeTitleData('kind:project%20objective')).toEqual({
            label: 'project objective',
            icon: 'lucide-box'
        });
    });
});
