import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysBetween,
  dueState,
  formatDateLong,
  formatDue,
  formatMonth,
  isoWeek,
  monthGrid,
  quickDates,
  startOfWeek,
  todayIso,
  weekdayIndex,
} from './dates';
import { adjustSchedule } from './schedule';

describe('dates', () => {
  it('uses the local date for today', () => {
    expect(todayIso(new Date(2026, 9, 15, 23, 59))).toBe('2026-10-15');
    expect(todayIso(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('adds days across months, years and daylight saving changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // DST ends on 25.10.2026 in Germany
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // DST starts on 29.03.2026
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-26', '2026-10-24')).toBe(-2);
  });

  it('starts weeks on Monday', () => {
    expect(weekdayIndex('2026-10-12')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-18')).toBe(6); // Sunday
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
  });

  it('computes ISO week numbers, also around the turn of the year', () => {
    expect(isoWeek('2026-10-15')).toBe(42);
    expect(isoWeek('2026-01-01')).toBe(1); // Thursday
    expect(isoWeek('2027-01-01')).toBe(53); // Friday, belongs to week 53 of 2026
    expect(isoWeek('2024-12-30')).toBe(1); // Monday, week 1 of 2025
  });

  it('builds a 6-week month grid starting on Monday', () => {
    const grid = monthGrid('2026-10-15');
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]![0]).toBe('2026-09-28');
    expect(grid[0]![3]).toBe('2026-10-01');
    expect(grid[5]![6]).toBe('2026-11-08');
  });

  it('adds months and clamps the day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', -10)).toBe('2025-12-15');
  });

  it('offers quick dates', () => {
    expect(quickDates('2026-10-15')).toEqual({ today: '2026-10-15', tomorrow: '2026-10-16', nextWeek: '2026-10-19' });
  });

  it('formats in German', () => {
    expect(formatDateLong('2026-10-17')).toBe('Sa., 17.10.2026');
    expect(formatMonth('2026-10-17')).toBe('Oktober 2026');
    expect(formatDue('2026-10-15', '2026-10-15')).toBe('Heute');
    expect(formatDue('2026-10-16', '2026-10-15')).toBe('Morgen');
    expect(formatDue('2026-10-14', '2026-10-15')).toBe('Gestern');
    expect(formatDue('2026-10-20', '2026-10-15')).toBe('20.10.');
    expect(formatDue('2027-01-04', '2026-10-15')).toBe('04.01.2027');
  });

  it('classifies due dates; done tasks are never overdue', () => {
    expect(dueState('2026-10-14', '2026-10-15')).toBe('overdue');
    expect(dueState('2026-10-15', '2026-10-15')).toBe('today');
    expect(dueState('2026-10-17', '2026-10-15')).toBe('soon');
    expect(dueState('2026-10-18', '2026-10-15')).toBe('later');
    expect(dueState('2026-10-14', '2026-10-15', true)).toBe('done');
  });
});

describe('adjustSchedule', () => {
  const base = { priority: null, startDate: '2026-10-12', dueDate: '2026-10-16' };

  it('drags the other date along instead of breaking start ≤ due', () => {
    expect(adjustSchedule(base, { dueDate: '2026-10-10' })).toMatchObject({ startDate: '2026-10-10', dueDate: '2026-10-10' });
    expect(adjustSchedule(base, { startDate: '2026-10-20' })).toMatchObject({ startDate: '2026-10-20', dueDate: '2026-10-20' });
    expect(adjustSchedule(base, { startDate: '2026-10-14' })).toMatchObject({ startDate: '2026-10-14', dueDate: '2026-10-16' });
  });

  it('removes the start with the due date and gives a lone start a due date', () => {
    expect(adjustSchedule(base, { dueDate: null })).toMatchObject({ startDate: null, dueDate: null });
    expect(adjustSchedule({ ...base, startDate: null, dueDate: null }, { startDate: '2026-10-12' })).toMatchObject({
      startDate: '2026-10-12',
      dueDate: '2026-10-12',
    });
  });
});
