import { describe, expect, it } from 'vitest';
import { matchesQuery } from './matchQuery';

describe('matchesQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesQuery('  ', 'Board öffnen')).toBe(true);
  });

  it('needs every word somewhere in the texts, ignoring case', () => {
    expect(matchesQuery('board öff', 'Board öffnen')).toBe(true);
    expect(matchesQuery('THEME dunkel', 'Theme: Dunkel', 'dark mode')).toBe(true);
    expect(matchesQuery('theme rot', 'Theme: Dunkel')).toBe(false);
  });

  it('searches extra keywords', () => {
    expect(matchesQuery('dark', 'Theme: Dunkel', 'dark nacht')).toBe(true);
  });
});
