import { describe, expect, it } from 'vitest';
import {
  breachIntervals,
  bucketLabel,
  bucketRangeLabel,
  formatDuration,
  isoWeek,
  presetRange,
  readFilter,
  writeFilter,
} from './analytics';

const HOUR = 60 * 60 * 1000;
const today = new Date(2026, 9, 17); // Saturday, 17 October 2026

describe('ranges and the URL', () => {
  it('ends presets today', () => {
    expect(presetRange('4w', today)).toEqual({ from: '2026-09-20', to: '2026-10-17' });
    expect(presetRange('3m', today)).toEqual({ from: '2026-07-18', to: '2026-10-17' });
    expect(presetRange('12m', today)).toEqual({ from: '2025-10-18', to: '2026-10-17' });
  });

  it('reads presets, custom ranges and broken values', () => {
    expect(readFilter(new URLSearchParams(''), today)).toEqual({ preset: '3m', from: '2026-07-18', to: '2026-10-17', granularity: 'week' });
    expect(readFilter(new URLSearchParams('range=12m'), today)).toMatchObject({ preset: '12m', granularity: 'month' });
    expect(readFilter(new URLSearchParams('range=12m&g=week'), today)).toMatchObject({ granularity: 'week' });
    expect(readFilter(new URLSearchParams('from=2026-01-05&to=2026-02-01&g=month'), today)).toEqual({
      preset: 'custom',
      from: '2026-01-05',
      to: '2026-02-01',
      granularity: 'month',
    });
    // Invalid date, reversed range, unknown preset: back to the default.
    for (const query of ['from=2026-02-30&to=2026-03-01', 'from=2026-03-01&to=2026-02-01', 'range=forever']) {
      expect(readFilter(new URLSearchParams(query), today).preset).toBe('3m');
    }
  });

  it('writes only what differs from the defaults', () => {
    expect(writeFilter({ preset: '3m', from: 'x', to: 'y', granularity: 'week' }).toString()).toBe('range=3m');
    expect(writeFilter({ preset: '12m', from: 'x', to: 'y', granularity: 'week' }).toString()).toBe('range=12m&g=week');
    expect(writeFilter({ preset: 'custom', from: '2026-01-05', to: '2026-02-01', granularity: 'week' }).toString()).toBe(
      'from=2026-01-05&to=2026-02-01',
    );
  });
});

describe('labels', () => {
  it('numbers ISO weeks, also around the turn of the year', () => {
    expect(isoWeek('2026-10-12')).toBe(42);
    expect(isoWeek('2026-12-28')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(isoWeek('2024-12-30')).toBe(1);
  });

  it('labels buckets', () => {
    expect(bucketLabel('2026-10-12', 'week')).toBe('KW 42');
    expect(bucketRangeLabel('2026-10-12', 'week')).toBe('12.10. – 18.10.2026');
    expect(bucketRangeLabel('2026-10-01', 'month')).toBe('Oktober 2026');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(10 * 60 * 1000)).toBe('< 1 Std.');
    expect(formatDuration(5 * HOUR)).toBe('5 Std.');
    expect(formatDuration(36 * HOUR)).toBe('36 Std.');
    expect(formatDuration(84 * HOUR)).toBe('3,5 Tage');
    expect(formatDuration(300 * HOUR)).toBe('13 Tage');
  });
});

describe('breachIntervals', () => {
  it('joins neighboring stretches over the limit', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
    expect(
      breachIntervals([
        { at: at(0), count: 2, limit: 2 },
        { at: at(1), count: 3, limit: 2 },
        { at: at(2), count: 4, limit: 2 },
        { at: at(3), count: 2, limit: 2 },
        { at: at(5), count: 5, limit: null },
        { at: at(6), count: 3, limit: 1 },
        { at: at(8), count: 3, limit: 1 },
      ]),
    ).toEqual([
      [Date.parse(at(1)), Date.parse(at(3))],
      [Date.parse(at(6)), Date.parse(at(8))],
    ]);
  });
});
