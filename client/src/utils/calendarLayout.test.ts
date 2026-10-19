import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import { hiddenPerDay, layoutWeek, scheduleOn, shiftTask } from './calendarLayout';
import { weekDays } from './dates';

let nextId = 1;
const task = (fields: Partial<Task>): Task => ({
  id: nextId++,
  projectId: 1,
  columnId: 1,
  laneId: 1,
  title: 'T',
  description: '',
  position: 1,
  sourceNote: null,
  linkedNotes: [],
  priority: null,
  links: [],
  attachments: [],
  labels: [],
  startDate: null,
  dueDate: null,
  createdAt: '',
  updatedAt: '',
  ...fields,
});

const week = weekDays('2026-10-12'); // Mon 12. – Sun 18.10.2026

describe('layoutWeek', () => {
  it('places single days and ranges, clipped to the week', () => {
    const single = task({ title: 'single', dueDate: '2026-10-14' });
    const range = task({ title: 'range', startDate: '2026-10-08', dueDate: '2026-10-13' });
    const after = task({ title: 'after', startDate: '2026-10-17', dueDate: '2026-10-22' });
    const outside = task({ title: 'outside', dueDate: '2026-10-19' });
    const unscheduled = task({ title: 'none' });

    const bars = layoutWeek(week, [single, range, after, outside, unscheduled]);
    expect(bars.map((b) => [b.task.title, b.start, b.span, b.row, b.continuesBefore, b.continuesAfter])).toEqual([
      ['range', 0, 2, 0, true, false],
      ['single', 2, 1, 0, false, false],
      ['after', 5, 2, 0, false, true],
    ]);
  });

  it('stacks overlapping bars, longer and more urgent ones first', () => {
    const short = task({ title: 'short', dueDate: '2026-10-13', priority: 'low' });
    const urgent = task({ title: 'urgent', dueDate: '2026-10-13', priority: 'urgent' });
    const long = task({ title: 'long', startDate: '2026-10-13', dueDate: '2026-10-16' });
    const bars = layoutWeek(week, [short, urgent, long]);
    expect(bars.map((b) => [b.task.title, b.row])).toEqual([
      ['long', 0],
      ['urgent', 1],
      ['short', 2],
    ]);
    expect(hiddenPerDay(bars, 2)).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(hiddenPerDay(bars, 1)).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });
});

describe('moving in the calendar', () => {
  it('shifts the whole range and keeps its length', () => {
    expect(shiftTask(task({ startDate: '2026-10-12', dueDate: '2026-10-14' }), 20)).toEqual({
      startDate: '2026-11-01',
      dueDate: '2026-11-03',
    });
    expect(shiftTask(task({ dueDate: '2026-10-14' }), -1)).toEqual({ startDate: null, dueDate: '2026-10-13' });
    expect(shiftTask(task({}), 1)).toBeUndefined();
  });

  it('schedules a dropped task so that it ends on the target day', () => {
    expect(scheduleOn(task({ startDate: '2026-10-12', dueDate: '2026-10-14' }), '2026-10-20')).toEqual({
      startDate: '2026-10-18',
      dueDate: '2026-10-20',
    });
    expect(scheduleOn(task({}), '2026-10-20')).toEqual({ startDate: null, dueDate: '2026-10-20' });
  });
});
