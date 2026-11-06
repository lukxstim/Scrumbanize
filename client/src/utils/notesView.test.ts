import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTES_VIEW, isNotesView, withDefaults } from './notesView';

describe('isNotesView', () => {
  it('accepts both layouts with the tag and backlink switches', () => {
    expect(isNotesView(DEFAULT_NOTES_VIEW)).toBe(true);
    expect(isNotesView({ layout: 'list', showTags: true, backlinksOpen: false })).toBe(true);
  });

  it('accepts a view stored before "Verlinkt von" could be closed', () => {
    expect(isNotesView({ layout: 'list', showTags: true })).toBe(true);
  });

  it('rejects anything else, so a stored value from elsewhere falls back to the default', () => {
    expect(isNotesView(null)).toBe(false);
    expect(isNotesView('tree')).toBe(false);
    expect(isNotesView({ layout: 'grid', showTags: false })).toBe(false);
    expect(isNotesView({ layout: 'tree' })).toBe(false);
    expect(isNotesView({ layout: 'tree', showTags: false, backlinksOpen: 'yes' })).toBe(false);
  });
});

describe('withDefaults', () => {
  it('keeps the stored choices and opens "Verlinkt von" when nothing was chosen yet', () => {
    const old = { layout: 'list', showTags: true } as unknown as Parameters<typeof withDefaults>[0];
    expect(withDefaults(old)).toEqual({ layout: 'list', showTags: true, backlinksOpen: true });
    expect(withDefaults({ layout: 'tree', showTags: false, backlinksOpen: false }).backlinksOpen).toBe(false);
  });
});
