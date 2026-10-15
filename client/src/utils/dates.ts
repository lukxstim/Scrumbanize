/**
 * Calendar dates as the API stores them: "YYYY-MM-DD" strings without time or time zone.
 * Arithmetic goes through UTC, so daylight saving changes never shift a day; "today" is the local date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

function toUtc(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The local date of `now`. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  return fromUtc(new Date(toUtc(iso).getTime() + days * MS_PER_DAY));
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** ISO 8601 week number: weeks start on Monday, week 1 contains the year's first Thursday. */
export function isoWeek(iso: string): number {
  const thursday = addDays(iso, 3 - weekdayIndex(iso));
  const firstOfYear = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(firstOfYear, thursday) / 7) + 1;
}

/** The seven days of the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 6 weeks × 7 days covering the month of `iso`, starting on the Monday on or before the 1st. */
export function monthGrid(iso: string): string[][] {
  const first = startOfWeek(`${iso.slice(0, 7)}-01`);
  return Array.from({ length: 6 }, (_, week) => weekDays(addDays(first, week * 7)));
}

/** The same day of month in another month, clamped (31.01. + 1 month → 28./29.02.). */
export function addMonths(iso: string, months: number): string {
  const date = toUtc(iso);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return fromUtc(target);
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** Values for the quick buttons of a date field. "Nächste Woche" is the Monday of next week. */
export function quickDates(today: string) {
  return { today, tomorrow: addDays(today, 1), nextWeek: addDays(startOfWeek(today), 7) };
}

const longFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/** "17.10." */
export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/** "17.10.2026" */
export function formatDate(iso: string): string {
  return `${formatDayMonth(iso)}${iso.slice(0, 4)}`;
}

/** "Sa., 17.10.2026" */
export function formatDateLong(iso: string): string {
  return longFormat.format(toUtc(iso));
}

/** "Oktober 2026" */
export function formatMonth(iso: string): string {
  return monthFormat.format(toUtc(iso));
}

/** "Mo" … "So" */
export function formatWeekday(iso: string): string {
  return weekdayFormat.format(toUtc(iso)).replace('.', '');
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'done';

/** How urgent a due date is; tasks in the done column are never overdue. "soon" covers the next two days. */
export function dueState(dueDate: string, today: string, done = false): DueState {
  if (done) return 'done';
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= 2 ? 'soon' : 'later';
}

/** "Heute", "Morgen", "Gestern" or "17.10." (with the year if it is not the current one). */
export function formatDue(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Morgen';
  if (days === -1) return 'Gestern';
  return dueDate.slice(0, 4) === today.slice(0, 4) ? formatDayMonth(dueDate) : formatDate(dueDate);
}
