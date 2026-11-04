import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTES_VIEW, isNotesView } from './notesView';

describe('isNotesView', () => {
  it('accepts both layouts with the tag switch', () => {
    expect(isNotesView(DEFAULT_NOTES_VIEW)).toBe(true);
    expect(isNotesView({ layout: 'list', showTags: true })).toBe(true);
  });

  it('rejects anything else, so a stored value from elsewhere falls back to the default', () => {
    expect(isNotesView(null)).toBe(false);
    expect(isNotesView('tree')).toBe(false);
    expect(isNotesView({ layout: 'grid', showTags: false })).toBe(false);
    expect(isNotesView({ layout: 'tree' })).toBe(false);
  });
});
