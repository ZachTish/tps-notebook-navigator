/* TPS Notebook Navigator - release-note version alignment. */

import { describe, expect, it } from 'vitest';
import { getLatestReleaseNotes, getReleaseNotesBetweenVersions } from '../src/releaseNotes';

describe('TPS release notes', () => {
    it('keeps the current plugin release first and available in the 4.1 to 4.3 update range', () => {
        expect(getLatestReleaseNotes(1).map(note => note.version)).toEqual(['4.3.0']);
        expect(getReleaseNotesBetweenVersions('4.1.0', '4.3.0').map(note => note.version)).toEqual(['4.3.0', '4.2.0', '4.1.0']);
    });
});
