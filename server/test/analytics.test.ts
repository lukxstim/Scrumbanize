import { describe, expect, it } from 'vitest';
import {
  bucketStart,
  buildReport,
  durationStats,
  findCompletions,
  localDate,
  nextBucket,
  resolveRange,
  startOfDay,
  wipHistory,
  type AnalyticsInput,
  type BoardEvent,
} from '../src/analytics.js';

const t = (iso: string) => Date.parse(iso);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const COLUMNS = [
  { id: 1, name: 'Backlog', wipLimit: null },
  { id: 2, name: 'Doing', wipLimit: 2 },
  { id: 3, name: 'Done', wipLimit: null },
];

function input(overrides: Partial<AnalyticsInput>): AnalyticsInput {
  return {
    columns: COLUMNS,
    taskCounts: new Map(),
    tasks: new Map(),
    events: [],
    coverageStart: t('2026-10-01T00:00:00Z'),
    now: t('2026-10-12T00:00:00Z'),
    ...overrides,
  };
}

const create = (taskId: number, columnId: number | null, at: string): BoardEvent => ({
  type: 'task-create', at: t(at), taskId, title: `Task ${taskId}`, columnId,
});
const move = (taskId: number, fromColumnId: number, toColumnId: number, at: string): BoardEvent => ({
  type: 'task-move', at: t(at), taskId, title: `Task ${taskId}`, fromColumnId, toColumnId,
});
const task = (createdAt: string, live = true) => ({ title: 'from tasks', createdAt: t(createdAt), live });

describe('calendar days', () => {
  it('counts days in the given time zone, also across daylight saving time', () => {
    // Summer time in Berlin begins on 2026-03-29 at 02:00; that midnight is still +01:00, the next one +02:00.
    expect(new Date(startOfDay('2026-03-29', 'Europe/Berlin')).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(new Date(startOfDay('2026-03-30', 'Europe/Berlin')).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(new Date(startOfDay('2026-10-17', 'UTC')).toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(localDate(t('2026-10-18T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-19');
    expect(localDate(t('2026-10-18T22:30:00Z'), 'UTC')).toBe('2026-10-18');
  });

  it('starts weeks on Monday and months on the first', () => {
    expect(bucketStart('2026-10-18', 'week')).toBe('2026-10-12'); // a Sunday
    expect(bucketStart('2026-10-12', 'week')).toBe('2026-10-12');
    expect(bucketStart('2026-10-18', 'month')).toBe('2026-10-01');
    expect(nextBucket('2026-12-28', 'week')).toBe('2027-01-04');
    expect(nextBucket('2026-12-01', 'month')).toBe('2027-01-01');
  });

  it('widens the range to whole buckets and defaults to this week and the eleven before', () => {
    const now = t('2026-10-17T10:00:00Z'); // a Saturday
    expect(resolveRange({ granularity: 'week', timeZone: 'UTC' }, now)).toEqual({
      from: '2026-07-27',
      to: '2026-10-18',
      granularity: 'week',
      timeZone: 'UTC',
    });
    expect(resolveRange({ from: '2026-02-10', to: '2026-03-03', granularity: 'month', timeZone: 'UTC' }, now)).toMatchObject({
      from: '2026-02-01',
      to: '2026-03-31',
    });
  });
});

describe('durationStats', () => {
  it('gives median, 85th percentile and mean', () => {
    expect(durationStats([4, 1, 3, 2])).toEqual({ count: 4, medianMs: 2.5, p85Ms: 3.55, meanMs: 2.5 });
    expect(durationStats([])).toEqual({ count: 0, medianMs: null, p85Ms: null, meanMs: null });
  });
});

describe('findCompletions', () => {
  it('counts every arrival in Done and times lead and cycle time', () => {
    const completions = findCompletions(
      input({
        tasks: new Map([
          [10, task('2026-10-05T08:00:00Z')],
          [11, task('2026-10-07T08:00:00Z', false)],
          [12, task('2026-10-09T08:00:00Z')],
          [13, task('2026-09-01T08:00:00Z')],
        ]),
        events: [
          create(10, 1, '2026-10-05T08:00:00Z'),
          move(10, 1, 2, '2026-10-06T08:00:00Z'),
          create(11, 2, '2026-10-07T08:00:00Z'), // created further right: the cycle starts right away
          move(11, 2, 3, '2026-10-07T21:00:00Z'),
          move(10, 2, 3, '2026-10-08T08:00:00Z'),
          move(10, 3, 2, '2026-10-09T08:00:00Z'), // reopened …
          create(12, 3, '2026-10-09T08:00:00Z'), // created as done
          move(10, 2, 3, '2026-10-10T08:00:00Z'), // … and done again
          move(13, 2, 3, '2026-10-10T09:00:00Z'), // created before the log began
          move(13, 3, 3, '2026-10-10T10:00:00Z'), // another lane in Done: no new completion
        ],
      }),
    );

    expect(completions.map((c) => [c.taskId, c.leadTimeMs, c.cycleTimeMs, c.live])).toEqual([
      [11, 13 * HOUR, 13 * HOUR, false],
      [10, 3 * DAY, 2 * DAY, true],
      [12, null, null, true],
      [10, 5 * DAY, 4 * DAY, true],
      [13, 39 * DAY + HOUR, null, true],
    ]);
    expect(completions[0]!.title).toBe('from tasks');
  });

  it('takes titles from the log for purged tasks', () => {
    const [completion] = findCompletions(
      input({ events: [create(20, 1, '2026-10-02T00:00:00Z'), move(20, 1, 3, '2026-10-03T00:00:00Z')] }),
    );
    expect(completion).toMatchObject({ title: 'Task 20', leadTimeMs: DAY, cycleTimeMs: 0, live: false });
  });
});

describe('wipHistory', () => {
  const window = [t('2026-09-28T00:00:00Z'), t('2026-10-12T00:00:00Z')] as const;

  it('replays counts back from today and finds breaches, also from lowering the limit', () => {
    const [doing, ...rest] = wipHistory(
      input({
        taskCounts: new Map([[2, 2]]),
        events: [
          create(1, 2, '2026-10-02T00:00:00Z'),
          create(2, 2, '2026-10-02T00:00:00Z'),
          create(3, 2, '2026-10-03T00:00:00Z'),
          { type: 'wip-limit', at: t('2026-10-05T00:00:00Z'), columnId: 2, from: 3, to: 2 }, // 3 tasks, limit 2
          move(3, 2, 3, '2026-10-06T00:00:00Z'),
          create(4, 2, '2026-10-08T00:00:00Z'),
          // An entry from before US-14, with the column's name only.
          { type: 'task-trash', at: t('2026-10-08T12:00:00Z'), taskId: 4, columnId: null, columnName: 'doing' },
        ],
      }),
      ...window,
    );

    expect(rest).toEqual([]); // columns without a limit are left out
    expect(doing).toMatchObject({ id: 2, name: 'Doing', exists: true, wipLimit: 2, episodes: 2, overLimitMs: 1.5 * DAY, peakOver: 1 });
    expect(doing!.series).toEqual([
      { at: '2026-10-01T00:00:00.000Z', count: 0, limit: 3 },
      { at: '2026-10-02T00:00:00.000Z', count: 2, limit: 3 },
      { at: '2026-10-03T00:00:00.000Z', count: 3, limit: 3 },
      { at: '2026-10-05T00:00:00.000Z', count: 3, limit: 2 },
      { at: '2026-10-06T00:00:00.000Z', count: 2, limit: 2 },
      { at: '2026-10-08T00:00:00.000Z', count: 3, limit: 2 },
      { at: '2026-10-08T12:00:00.000Z', count: 2, limit: 2 },
      { at: '2026-10-12T00:00:00.000Z', count: 2, limit: 2 },
    ]);
  });

  it('follows tasks moved along when a column is deleted', () => {
    const wip = wipHistory(
      input({
        taskCounts: new Map([[3, 2]]),
        events: [
          { type: 'wip-limit', at: t('2026-10-02T00:00:00Z'), columnId: 4, from: null, to: 1 },
          create(1, 1, '2026-10-02T00:00:00Z'),
          create(2, 1, '2026-10-02T00:00:00Z'),
          move(1, 1, 4, '2026-10-03T00:00:00Z'),
          move(2, 1, 4, '2026-10-03T06:00:00Z'),
          { type: 'column-delete', at: t('2026-10-04T00:00:00Z'), columnId: 4, name: 'Review', movedTasks: 2, targetId: 3 },
        ],
      }),
      ...window,
    );
    // "Doing" has a limit, too, and is listed without breaches; the deleted column comes last.
    expect(wip.map((c) => [c.name, c.episodes])).toEqual([['Doing', 0], ['Review', 1]]);
    expect(wip[1]).toMatchObject({ id: 4, exists: false, wipLimit: null, overLimitMs: 18 * HOUR, peakOver: 1 });
  });

  it('counts a breach that is still going on at the start of the range, and only its part inside', () => {
    const [doing] = wipHistory(
      input({
        taskCounts: new Map([[2, 3]]),
        events: [create(1, 2, '2026-10-02T00:00:00Z'), create(2, 2, '2026-10-02T00:00:00Z'), create(3, 2, '2026-10-03T00:00:00Z')],
      }),
      t('2026-10-05T00:00:00Z'),
      t('2026-10-07T00:00:00Z'),
    );
    expect(doing).toMatchObject({ episodes: 1, overLimitMs: 2 * DAY, peakOver: 1 });
  });
});

describe('buildReport', () => {
  it('buckets by the viewer’s days and has no data before the log began', () => {
    const events = [create(1, 1, '2026-09-30T10:00:00Z'), move(1, 1, 3, '2026-10-04T22:30:00Z')]; // Sunday 22:30 UTC
    const base = input({ events, coverageStart: t('2026-09-30T10:00:00Z'), now: t('2026-10-10T00:00:00Z') });
    const range = { from: '2026-09-21', to: '2026-10-11', granularity: 'week' as const };

    const utc = buildReport(base, { ...range, timeZone: 'UTC' });
    expect(utc.velocity).toEqual([
      { start: '2026-09-21', completed: null, created: null },
      { start: '2026-09-28', completed: 1, created: 1 },
      { start: '2026-10-05', completed: 0, created: 0 },
    ]);
    expect(utc).toMatchObject({ doneColumn: { id: 3, name: 'Done' }, totals: { completed: 1, created: 1 } });
    expect(utc.coverageStart).toBe('2026-09-30T10:00:00.000Z');

    // In Berlin it is already Monday.
    const berlin = buildReport(base, { ...range, timeZone: 'Europe/Berlin' });
    expect(berlin.velocity.map((b) => b.completed)).toEqual([null, 0, 1]);
    expect(berlin.leadTime).toMatchObject({ count: 1, medianMs: t('2026-10-04T22:30:00Z') - t('2026-09-30T10:00:00Z') });
  });

  it('has no figures for a project without any log entries', () => {
    const report = buildReport(input({ coverageStart: null }), { from: '2026-10-05', to: '2026-10-11', granularity: 'week', timeZone: 'UTC' });
    expect(report.velocity).toEqual([{ start: '2026-10-05', completed: null, created: null }]);
    expect(report.wip).toEqual([]);
    expect(report.coverageStart).toBeNull();
  });
});
