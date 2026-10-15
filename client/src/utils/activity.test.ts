import { describe, expect, it } from 'vitest';
import type { Activity } from '../types/activity';
import { activityLink, dayLabel, groupByDay, timeLabel } from './activity';

const now = new Date(2026, 9, 15, 14, 30); // Thursday, 15 October 2026, 14:30 local time

function activity(id: number, createdAt: Date, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    projectId: 1,
    entityType: 'note',
    entityId: 7,
    actionType: 'create',
    description: `Eintrag ${id}`,
    metadata: {},
    createdAt: createdAt.toISOString(),
    exists: true,
    ...overrides,
  };
}

describe('dayLabel', () => {
  it('names today and yesterday, otherwise weekday and date', () => {
    expect(dayLabel(new Date(2026, 9, 15, 0, 5), now)).toBe('Heute');
    expect(dayLabel(new Date(2026, 9, 14, 23, 59), now)).toBe('Gestern');
    expect(dayLabel(new Date(2026, 9, 12, 9), now)).toBe('Montag, 12. Oktober');
    expect(dayLabel(new Date(2025, 11, 31), now)).toBe('Mittwoch, 31. Dezember 2025');
  });
});

describe('groupByDay', () => {
  it('groups consecutive entries of the same day', () => {
    const groups = groupByDay(
      [activity(3, new Date(2026, 9, 15, 12)), activity(2, new Date(2026, 9, 15, 8)), activity(1, new Date(2026, 9, 13, 18))],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Heute', [3, 2]],
      ['Dienstag, 13. Oktober', [1]],
    ]);
  });
});

describe('timeLabel', () => {
  it('is relative within the last hour, then the time of day', () => {
    expect(timeLabel(new Date(2026, 9, 15, 14, 29, 40), now)).toBe('gerade eben');
    expect(timeLabel(new Date(2026, 9, 15, 14, 5), now)).toBe('vor 25 Min.');
    expect(timeLabel(new Date(2026, 9, 15, 9, 7), now)).toBe('09:07');
  });
});

describe('activityLink', () => {
  it('links to existing notes and tasks, and to the board for board changes', () => {
    expect(activityLink(activity(1, now))).toBe('/p/1/notes/7');
    expect(activityLink(activity(1, now, { entityType: 'task', entityId: 3 }))).toBe('/p/1/tasks/3');
    expect(activityLink(activity(1, now, { entityType: 'board', entityId: 9 }))).toBe('/p/1/board');
  });

  it('does not link deleted items or project entries', () => {
    expect(activityLink(activity(1, now, { exists: false }))).toBeUndefined();
    expect(activityLink(activity(1, now, { entityType: 'project', entityId: 1 }))).toBeUndefined();
  });
});
