/* TPS Notebook Navigator - release-note version alignment. */

import { describe, expect, it } from 'vitest';
import { getLatestReleaseNotes, getReleaseNotesBetweenVersions } from '../src/releaseNotes';

describe('TPS release notes', () => {
    it('keeps the current plugin release first and available in the 4.1 to current update range', () => {
        expect(getLatestReleaseNotes(1).map(note => note.version)).toEqual(['4.9.1']);
        expect(getReleaseNotesBetweenVersions('4.1.0', '4.9.1').map(note => note.version)).toEqual([
            '4.9.1',
            '4.9.0',
            '4.8.0',
            '4.7.1',
            '4.7.0',
            '4.6.0',
            '4.5.0',
            '4.4.0',
            '4.3.0',
            '4.2.0',
            '4.1.0'
        ]);
    });
});
