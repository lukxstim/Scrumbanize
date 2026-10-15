import { describe, expect, it } from 'vitest';
import { isReminderState, reminderStep } from './updateReminder';

const now = new Date('2026-10-16T10:00:00.000Z');

describe('update reminder', () => {
  it('only schedules on the first start', () => {
    expect(reminderStep(null, now)).toEqual({ remind: false, next: { nextAt: '2026-11-13T10:00:00.000Z' } });
  });

  it('reminds once the time has come, then waits another 4 weeks', () => {
    expect(reminderStep({ nextAt: '2026-10-20T00:00:00.000Z' }, now)).toEqual({ remind: false, next: null });
    expect(reminderStep({ nextAt: '2026-10-16T10:00:00.000Z' }, now)).toEqual({
      remind: true,
      next: { nextAt: '2026-11-13T10:00:00.000Z' },
    });
  });

  it('accepts only valid stored states', () => {
    expect(isReminderState(null)).toBe(true);
    expect(isReminderState({ nextAt: '2026-10-20T00:00:00.000Z' })).toBe(true);
    expect(isReminderState({ nextAt: 'bald' })).toBe(false);
    expect(isReminderState('x')).toBe(false);
  });
});
