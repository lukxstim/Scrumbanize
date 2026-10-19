import { describe, expect, it } from 'vitest';
import { allNotesPath, TAG_PARAM } from './paths';

describe('allNotesPath', () => {
  it('points at "Alle Notizen", a note in it, and keeps the tag filter in the address', () => {
    expect(allNotesPath()).toBe('/wissen/notizen');
    expect(allNotesPath(42)).toBe('/wissen/notizen/42');
    expect(allNotesPath(42, ['rezept', 'schnell & einfach'])).toBe('/wissen/notizen/42?tag=rezept&tag=schnell+%26+einfach');
    const search = new URL(allNotesPath(undefined, ['a b', 'c']), 'http://x').searchParams;
    expect(search.getAll(TAG_PARAM)).toEqual(['a b', 'c']);
  });
});
