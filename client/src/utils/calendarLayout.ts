import type { Task } from '../types/task';
import { addDays, daysBetween } from './dates';
import { priorityRank } from './priority';

/** A task's bar within one week row of the calendar. */
export interface CalendarBar {
  task: Task;
  /** Day index of the bar's first visible day, 0 = Monday. */
  start: number;
  /** Number of visible days, at least 1. */
  span: number;
  /** Vertical slot within the week; bars in the same slot never overlap. */
  row: number;
  /** The task started before / ends after this week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** The days a task covers: from its start (or due) date to its due date. Undefined if unscheduled. */
export function taskRange(task: Task): { from: string; to: string } | undefined {
  if (!task.dueDate) return undefined;
  return { from: task.startDate ?? task.dueDate, to: task.dueDate };
}

/**
 * Lays out the tasks touching a week (7 consecutive days starting at `days[0]`). Earlier and longer bars
 * get the upper slots, then more urgent ones, so the layout stays stable while days are added.
 */
export function layoutWeek(days: string[], tasks: Task[]): CalendarBar[] {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const candidates = tasks
    .map((task) => ({ task, range: taskRange(task) }))
    .filter((item): item is { task: Task; range: { from: string; to: string } } =>
      Boolean(item.range && item.range.from <= last && item.range.to >= first),
    )
    .map(({ task, range }) => {
      const start = Math.max(0, daysBetween(first, range.from));
      const end = Math.min(days.length - 1, daysBetween(first, range.to));
      return { task, start, span: end - start + 1, continuesBefore: range.from < first, continuesAfter: range.to > last };
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.span - a.span ||
        priorityRank(a.task.priority) - priorityRank(b.task.priority) ||
        a.task.id - b.task.id,
    );

  // Greedy slot assignment: each slot remembers the first free day index.
  const slotFreeFrom: number[] = [];
  return candidates.map((bar) => {
    let row = slotFreeFrom.findIndex((free) => free <= bar.start);
    if (row === -1) row = slotFreeFrom.length;
    slotFreeFrom[row] = bar.start + bar.span;
    return { ...bar, row };
  });
}

/** Per day of the week: how many bars are hidden because only `maxRows` slots are shown. */
export function hiddenPerDay(bars: CalendarBar[], maxRows: number, dayCount = 7): number[] {
  const hidden = Array.from({ length: dayCount }, () => 0);
  for (const bar of bars) {
    if (bar.row < maxRows) continue;
    for (let day = bar.start; day < bar.start + bar.span; day++) hidden[day]!++;
  }
  return hidden;
}

/**
 * The dates after dragging a scheduled task by `days`: the whole range moves, its length stays.
 * An unscheduled task dropped on a day gets that day as its due date (see `scheduleOn`).
 */
export function shiftTask(task: Task, days: number): { startDate: string | null; dueDate: string } | undefined {
  if (!task.dueDate) return undefined;
  return { startDate: task.startDate && addDays(task.startDate, days), dueDate: addDays(task.dueDate, days) };
}

/** Dropping a task on `day`: scheduled tasks keep their length and end there, unscheduled ones become due there. */
export function scheduleOn(task: Task, day: string): { startDate: string | null; dueDate: string } {
  return task.dueDate ? shiftTask(task, daysBetween(task.dueDate, day))! : { startDate: null, dueDate: day };
}
