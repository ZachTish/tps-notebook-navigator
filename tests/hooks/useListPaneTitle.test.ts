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
import { createTpsNavigatorProviderTypeId } from '../../src/types/navigatorTypes';

describe('getTpsNavigatorTypeTitleData', () => {
    it('uses the structural descriptor label and icon', () => {
        expect(getTpsNavigatorTypeTitleData('structural:task')).toEqual({
            label: 'Checkboxes',
            icon: 'lucide-square-check-big'
        });
    });

    it('uses a generic fallback for an unavailable provider descriptor', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'missing')!;

        expect(getTpsNavigatorTypeTitleData(typeId)).toEqual({
            label: 'Types',
            icon: 'lucide-box'
        });
    });

    it('uses the active descriptor for an external provider collection', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        expect(
            getTpsNavigatorTypeTitleData(typeId, [
                {
                    id: typeId,
                    label: 'Active projects',
                    icon: 'lucide-folder-kanban',
                    category: 'structure',
                    count: 0,
                    showCount: false,
                    providerId: 'example/entities',
                    providerCollectionId: 'projects'
                }
            ])
        ).toEqual({ label: 'Active projects', icon: 'lucide-folder-kanban' });
    });
});
