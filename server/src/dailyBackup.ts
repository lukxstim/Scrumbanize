import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { writeBackupFile } from './backup.js';
import type { TimeOfDay } from './config.js';
import type { Db } from './database.js';
import { createMetaRepository } from './repositories/metaRepository.js';

/**
 * The daily backup (US-23): once a day, at BACKUP_TIME in the time zone TZ, the same ZIP as "Backup herunterladen"
 * goes into `<backups>/taeglich/`, and only the newest BACKUP_KEEP stay. Every minute the server checks whether it is
 * past that time today and today's backup is missing – so a server that was down at 3 a.m. catches up when it
 * starts, and changes to and from daylight saving time need no special care.
 */

export const DAILY_DIR_NAME = 'taeglich';
const DAILY_FILE = /^scrumbanize-backup-\d{4}-\d{2}-\d{2}\.zip$/;
const CHECK_INTERVAL_MS = 60_000;
const META_KEY = 'daily_backup';

export interface BackupSchedule {
  /** Null: no daily backups (BACKUP_TIME=off). */
  time: TimeOfDay | null;
  keep: number;
  timeZone: string;
}

/** What the last daily backups did, kept in app_meta; shown to administrators and in /api/health. */
export interface DailyBackupState {
  /** The calendar day (in the schedule's time zone) of the last successful backup. */
  lastDate?: string;
  lastAt?: string;
  lastFile?: string;
  lastSize?: number;
  /** The last failure, if it came after the last success. */
  errorAt?: string;
  error?: string;
}

/** Whether the folder exists (it is created if missing) and the server may write into it. */
export function isWritableDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The calendar day and the minutes since midnight of `now` in `timeZone`. */
export function wallClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Whether today's backup is due: it is past `time` today and the last one was made on another day. */
export function isDue(now: Date, time: TimeOfDay, timeZone: string, lastDate: string | undefined): boolean {
  const { date, minutes } = wallClock(now, timeZone);
  return minutes >= time.hour * 60 + time.minute && lastDate !== date;
}

/** Removes the oldest daily backups so that `keep` remain; other files in the folder are left alone. */
export async function pruneDailyBackups(dir: string, keep: number): Promise<string[]> {
  const files = (await fsp.readdir(dir).catch(() => [] as string[])).filter((name) => DAILY_FILE.test(name)).sort();
  const removed = files.slice(0, Math.max(0, files.length - keep));
  for (const name of removed) await fsp.rm(path.join(dir, name), { force: true });
  return removed;
}

export function readDailyBackupState(db: Db): DailyBackupState {
  try {
    const raw = createMetaRepository(db).get(META_KEY);
    return raw ? (JSON.parse(raw) as DailyBackupState) : {};
  } catch {
    return {};
  }
}

/** Whether the most recent attempt failed (an error after the last success). */
export function lastBackupFailed(state: DailyBackupState): boolean {
  return state.errorAt !== undefined && (state.lastAt === undefined || state.errorAt > state.lastAt);
}

/** Makes today's backup now and removes old ones. Records the result; throws if it failed. */
export async function runDailyBackup(options: {
  db: Db;
  uploadsDir: string;
  backupsDir: string;
  keep: number;
  timeZone: string;
  now?: Date;
}): Promise<{ file: string; size: number; removed: string[] }> {
  const { db, uploadsDir, keep, timeZone, now = new Date() } = options;
  const dir = path.join(options.backupsDir, DAILY_DIR_NAME);
  const meta = createMetaRepository(db);
  const { date } = wallClock(now, timeZone);
  const state = readDailyBackupState(db);
  try {
    const file = path.join(dir, `scrumbanize-backup-${date}.zip`);
    const { size } = await writeBackupFile(db, uploadsDir, file, now);
    const removed = await pruneDailyBackups(dir, keep);
    meta.set(META_KEY, JSON.stringify({ lastDate: date, lastAt: now.toISOString(), lastFile: path.basename(file), lastSize: size } satisfies DailyBackupState));
    return { file, size, removed };
  } catch (error) {
    meta.set(META_KEY, JSON.stringify({ ...state, errorAt: now.toISOString(), error: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}

export interface DailyBackups {
  /** Checks whether a backup is due and makes it; resolves when done (also used by tests). */
  check: () => Promise<void>;
  /** Stops the checks and waits for a backup that is still being written. */
  stop: () => Promise<void>;
}

/**
 * Starts the daily backups: a check right away (catching up on a missed backup) and then every minute. Messages go
 * to `log` (the server's output). Does nothing if the schedule has no time.
 */
export function startDailyBackups(options: {
  db: Db;
  uploadsDir: string;
  backupsDir: string;
  schedule: BackupSchedule;
  log?: (message: string) => void;
  now?: () => Date;
}): DailyBackups {
  const { db, uploadsDir, backupsDir, schedule, log = console.log, now = () => new Date() } = options;
  const time = schedule.time;
  if (time === null) return { check: async () => {}, stop: async () => {} };

  const dir = path.join(backupsDir, DAILY_DIR_NAME);
  if (!isWritableDir(dir)) {
    log(`Warning: backups cannot be written to ${dir}. Check the folder's owner (in Docker: sudo chown 1000:1000 backups).`);
  }

  let running: Promise<void> | null = null;
  let stopped = false;
  const check = (): Promise<void> => {
    if (stopped || running) return running ?? Promise.resolve();
    const at = now();
    if (!isDue(at, time, schedule.timeZone, readDailyBackupState(db).lastDate)) return Promise.resolve();
    running = runDailyBackup({ db, uploadsDir, backupsDir, keep: schedule.keep, timeZone: schedule.timeZone, now: at })
      .then(({ file, size, removed }) => {
        log(`Daily backup written: ${file} (${(size / 1024 / 1024).toFixed(1)} MB)${removed.length > 0 ? `, removed ${removed.length} older` : ''}`);
      })
      .catch((error: unknown) => {
        log(`Daily backup failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  void check();
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  // The checks never keep the process alive on their own.
  timer.unref();

  return {
    check,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
