import fs from 'node:fs';
import path from 'node:path';
import { Notification, powerMonitor } from 'electron';
import { isReminderLog, localDay, planReminders, reminderMessages, type DueTask, type ReminderLog, type ReminderMessage } from './reminderPlan.js';

const LOG_FILE = 'reminders-log.json';
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** After start and after waking up, so the window has appeared and the system has settled. */
const FIRST_CHECK_DELAY_MS = 10 * 1000;

export interface ReminderOptions {
  dataDir: string;
  enabled: boolean;
  /** Open tasks due on `day` or earlier, from the app's own server. */
  fetchDue: (day: string) => Promise<DueTask[]>;
  onClick: (message: ReminderMessage) => void;
  log: (message: string) => void;
}

export interface Reminders {
  /** `force` (tray menu "Erinnerungen jetzt prüfen") shows every due task again, or that there are none. */
  check: (force?: boolean) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
}

/** Windows notifications for open tasks due today or overdue (US-18), checked every 15 minutes and after waking up. */
export function startReminders(options: ReminderOptions): Reminders {
  const logFile = path.join(options.dataDir, LOG_FILE);
  let enabled = options.enabled;
  let checking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Notifications that are not referenced anymore are garbage-collected, and with them their click handlers.
  const shown = new Set<Notification>();

  function show(title: string, body: string, onClick?: () => void) {
    const notification = new Notification({ title, body });
    shown.add(notification);
    const forget = () => shown.delete(notification);
    notification.on('click', () => {
      forget();
      onClick?.();
    });
    notification.on('close', forget);
    notification.on('failed', (_event, error) => {
      forget();
      options.log(`Notification failed: ${error}`);
    });
    notification.show();
  }

  async function check(force = false) {
    if ((!enabled && !force) || checking || !Notification.isSupported()) return;
    checking = true;
    try {
      const today = localDay(new Date());
      const due = await options.fetchDue(today);
      const { notify, log } = planReminders(due, force ? null : readLog(logFile), today);
      writeLog(logFile, log);
      const messages = reminderMessages(notify, today);
      if (force && messages.length === 0) show('Keine fälligen Tasks', 'Heute ist nichts fällig und nichts überfällig.');
      for (const message of messages) show(message.title, message.body, () => options.onClick(message));
    } catch (error) {
      options.log(`Reminder check failed: ${String(error)}`);
    } finally {
      checking = false;
    }
  }

  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void check();
      schedule(CHECK_INTERVAL_MS);
    }, delay);
  };
  const onWake = () => schedule(FIRST_CHECK_DELAY_MS);
  powerMonitor.on('resume', onWake);
  powerMonitor.on('unlock-screen', onWake);
  schedule(FIRST_CHECK_DELAY_MS);

  return {
    check,
    setEnabled(next) {
      const switchedOn = next && !enabled;
      enabled = next;
      if (switchedOn) void check();
    },
    stop() {
      clearTimeout(timer);
      powerMonitor.off('resume', onWake);
      powerMonitor.off('unlock-screen', onWake);
    },
  };
}

function readLog(file: string): ReminderLog | null {
  try {
    const log: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isReminderLog(log) ? log : null;
  } catch {
    return null;
  }
}

function writeLog(file: string, log: ReminderLog): void {
  try {
    fs.writeFileSync(file, JSON.stringify(log));
  } catch {
    // At worst a reminder is shown twice.
  }
}
