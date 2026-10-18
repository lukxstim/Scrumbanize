import { describe, expect, it } from 'vitest';
import { dueLabel, isReminderLog, localDay, planReminders, reminderMessages, type DueTask } from '../src/reminderPlan.js';

const task = (id: number, dueDate: string, extra: Partial<DueTask> = {}): DueTask => ({
  id,
  projectId: 1,
  projectName: 'Allgemein',
  title: `Task ${id}`,
  dueDate,
  priority: null,
  ...extra,
});

describe('planReminders', () => {
  it('shows every due task on the first check of a day', () => {
    const due = [task(1, '2026-10-18'), task(2, '2026-10-10')];
    expect(planReminders(due, null, '2026-10-18')).toEqual({ notify: due, log: { day: '2026-10-18', notified: [1, 2] } });
  });

  it('shows a task only once per day, but a task that became due later that day at the next check', () => {
    const first = planReminders([task(1, '2026-10-18')], null, '2026-10-18');
    const again = planReminders([task(1, '2026-10-18'), task(2, '2026-10-18')], first.log, '2026-10-18');
    expect(again.notify.map((t) => t.id)).toEqual([2]);
    expect(again.log).toEqual({ day: '2026-10-18', notified: [1, 2] });
    expect(planReminders([task(1, '2026-10-18'), task(2, '2026-10-18')], again.log, '2026-10-18').notify).toEqual([]);
  });

  it('shows overdue tasks again every day until they are done', () => {
    const monday = planReminders([task(1, '2026-10-17')], null, '2026-10-18');
    const tuesday = planReminders([task(1, '2026-10-17')], monday.log, '2026-10-19');
    expect(tuesday.notify.map((t) => t.id)).toEqual([1]);
    expect(tuesday.log).toEqual({ day: '2026-10-19', notified: [1] });
  });

  it('forgets tasks that are no longer due only with the next day', () => {
    const log = { day: '2026-10-18', notified: [1, 2] };
    expect(planReminders([], log, '2026-10-18').log).toEqual(log);
    expect(planReminders([], log, '2026-10-19').log).toEqual({ day: '2026-10-19', notified: [] });
  });
});

describe('reminderMessages', () => {
  it('makes one notification per task for up to three tasks', () => {
    const messages = reminderMessages(
      [task(1, '2026-10-18', { priority: 'urgent', title: 'Steuer', projectName: 'Privat', projectId: 2 }), task(2, '2026-10-15')],
      '2026-10-18',
    );
    expect(messages).toEqual([
      { title: 'Heute fällig: Steuer', body: 'Privat · Priorität Dringend', task: expect.objectContaining({ id: 1 }), projectId: 2 },
      { title: 'Überfällig seit 3 Tagen: Task 2', body: 'Allgemein', task: expect.objectContaining({ id: 2 }), projectId: 1 },
    ]);
  });

  it('sums up more than three tasks in one notification', () => {
    const today = Array.from({ length: 2 }, (_, i) => task(i + 1, '2026-10-18'));
    const overdue = Array.from({ length: 4 }, (_, i) => task(i + 10, '2026-10-01'));
    expect(reminderMessages([...overdue, ...today], '2026-10-18')).toEqual([
      { title: '2 heute fällig, 4 überfällig', body: 'Task 10 · Task 11 · Task 12 …', projectId: 1 },
    ]);
    expect(reminderMessages(overdue, '2026-10-18')[0]!.title).toBe('4 Tasks überfällig');
    expect(reminderMessages([...today, ...today.map((t) => ({ ...t, id: t.id + 2 }))], '2026-10-18')[0]!.title).toBe('4 Tasks heute fällig');
  });

  it('makes none without tasks', () => {
    expect(reminderMessages([], '2026-10-18')).toEqual([]);
  });
});

describe('dates', () => {
  it('labels today and overdue days, also across month ends and time changes', () => {
    expect(dueLabel('2026-10-18', '2026-10-18')).toBe('Heute fällig');
    expect(dueLabel('2026-10-17', '2026-10-18')).toBe('Überfällig seit 1 Tag');
    expect(dueLabel('2026-10-20', '2026-11-02')).toBe('Überfällig seit 13 Tagen');
  });

  it('uses the local date', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('accepts only complete logs', () => {
    expect(isReminderLog({ day: '2026-10-18', notified: [1, 2] })).toBe(true);
    for (const value of [null, 'x', {}, { day: '2026-10-18' }, { day: '2026-10-18', notified: ['1'] }]) {
      expect(isReminderLog(value), JSON.stringify(value)).toBe(false);
    }
  });
});
