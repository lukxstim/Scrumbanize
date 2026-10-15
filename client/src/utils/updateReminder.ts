/**
 * The desktop app cannot see new versions by itself (the release repository is private), so it reminds the
 * user every few weeks to have a look at the release page.
 */
export const REMINDER_INTERVAL_DAYS = 28;
export const REMINDER_STORAGE_KEY = 'scrumbanize.updateReminder';

/** When the next reminder is due (ISO time); null until the app was opened for the first time. */
export interface ReminderState {
  nextAt: string;
}

export function isReminderState(value: unknown): value is ReminderState | null {
  if (value === null) return true;
  const nextAt = (value as ReminderState).nextAt;
  return typeof nextAt === 'string' && !Number.isNaN(Date.parse(nextAt));
}

export function nextReminder(now: Date): ReminderState {
  return { nextAt: new Date(now.getTime() + REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString() };
}

/**
 * What to do on start: on the very first start only schedule the first reminder (the onboarding tour comes
 * first); later, remind once the scheduled time has passed, and schedule the next one.
 */
export function reminderStep(state: ReminderState | null, now: Date): { remind: boolean; next: ReminderState | null } {
  if (state === null) return { remind: false, next: nextReminder(now) };
  if (now.getTime() >= Date.parse(state.nextAt)) return { remind: true, next: nextReminder(now) };
  return { remind: false, next: null };
}
