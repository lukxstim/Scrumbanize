/**
 * Which reminders to show (US-18), without Electron, so it can be tested. Every open task due today or earlier
 * is shown once per day: the first check of a day (start, waking up, the timer passing midnight) shows all of
 * them; a task that becomes due later that day follows at the next check.
 */

/** As GET /api/reminders/due returns it. */
export interface DueTask {
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
}

/** The task ids already shown on `day` (local date YYYY-MM-DD). */
export interface ReminderLog {
  day: string;
  notified: number[];
}

/** More tasks than this become one summary notification. */
export const MAX_SINGLE_NOTIFICATIONS = 3;

const PRIORITY_LABELS = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', urgent: 'Dringend' } as const;

export function isReminderLog(value: unknown): value is ReminderLog {
  const log = value as ReminderLog | null;
  return (
    !!log &&
    typeof log.day === 'string' &&
    Array.isArray(log.notified) &&
    log.notified.every((id) => Number.isInteger(id))
  );
}

/** The tasks not shown yet today, and the log afterwards. A log of an earlier day starts over. */
export function planReminders(due: DueTask[], log: ReminderLog | null, today: string): { notify: DueTask[]; log: ReminderLog } {
  const notified = new Set(log?.day === today ? log.notified : []);
  const notify = due.filter((task) => !notified.has(task.id));
  return { notify, log: { day: today, notified: [...notified, ...notify.map((task) => task.id)] } };
}

export interface ReminderMessage {
  title: string;
  body: string;
  /** The task a click opens; the summary opens the calendar of the first task's project instead. */
  task?: DueTask;
  projectId: number;
}

/** One notification per task, or a summary when there are more than MAX_SINGLE_NOTIFICATIONS. */
export function reminderMessages(tasks: DueTask[], today: string): ReminderMessage[] {
  if (tasks.length === 0) return [];
  if (tasks.length <= MAX_SINGLE_NOTIFICATIONS) {
    return tasks.map((task) => ({
      title: `${dueLabel(task.dueDate, today)}: ${task.title}`,
      body: [task.projectName, task.priority && `Priorität ${PRIORITY_LABELS[task.priority]}`].filter(Boolean).join(' · '),
      task,
      projectId: task.projectId,
    }));
  }
  const dueToday = tasks.filter((task) => task.dueDate >= today).length;
  const overdue = tasks.length - dueToday;
  const title =
    dueToday === 0
      ? `${overdue} Tasks überfällig`
      : overdue === 0
        ? `${dueToday} Tasks heute fällig`
        : `${dueToday} heute fällig, ${overdue} überfällig`;
  const shown = tasks.slice(0, MAX_SINGLE_NOTIFICATIONS).map((task) => task.title);
  return [{ title, body: `${shown.join(' · ')} …`, projectId: tasks[0]!.projectId }];
}

/** "Heute fällig", "Überfällig seit 1 Tag", "Überfällig seit 3 Tagen". */
export function dueLabel(dueDate: string, today: string): string {
  const days = daysBetween(dueDate, today);
  if (days <= 0) return 'Heute fällig';
  return `Überfällig seit ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

/** The local date of `now` as YYYY-MM-DD. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}
