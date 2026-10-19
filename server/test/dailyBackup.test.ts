import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { backupBeforeUpdate, extractBackup, UPDATE_COPIES_KEPT, validateBackup, writeBackupFile } from '../src/backup.js';
import {
  DAILY_DIR_NAME,
  isDue,
  lastBackupFailed,
  pruneDailyBackups,
  readDailyBackupState,
  runDailyBackup,
  startDailyBackups,
  wallClock,
} from '../src/dailyBackup.js';
import { migrations, openDatabase, type Db } from '../src/database.js';
import { healthReport } from '../src/health.js';

let dir: string;
let db: Db;
let uploadsDir: string;
let backupsDir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-daily-'));
  uploadsDir = path.join(dir, 'uploads');
  backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(uploadsDir);
  db = openDatabase(':memory:');
});
afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const at3 = { hour: 3, minute: 0 };
const daily = () => path.join(backupsDir, DAILY_DIR_NAME);

describe('when the daily backup is due', () => {
  it('reads the day and time in the given zone, across daylight saving time', () => {
    expect(wallClock(new Date('2026-10-19T01:30:00Z'), 'Europe/Berlin')).toEqual({ date: '2026-10-19', minutes: 3 * 60 + 30 });
    expect(wallClock(new Date('2026-10-18T23:30:00Z'), 'Europe/Berlin')).toEqual({ date: '2026-10-19', minutes: 90 });
    // Last Sunday of March: 01:30 UTC is 03:30 summer time.
    expect(wallClock(new Date('2026-03-29T00:30:00Z'), 'Europe/Berlin').minutes).toBe(90);
    expect(wallClock(new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin').minutes).toBe(210);
    expect(wallClock(new Date('2026-10-19T01:30:00Z'), 'UTC')).toEqual({ date: '2026-10-19', minutes: 90 });
  });

  it('is due after the time once a day, and catches up on a missed day', () => {
    const berlin = (iso: string) => new Date(iso);
    expect(isDue(berlin('2026-10-19T00:59:00Z'), at3, 'Europe/Berlin', '2026-10-18')).toBe(false); // 02:59
    expect(isDue(berlin('2026-10-19T01:00:00Z'), at3, 'Europe/Berlin', '2026-10-18')).toBe(true); // 03:00
    expect(isDue(berlin('2026-10-19T01:01:00Z'), at3, 'Europe/Berlin', '2026-10-19')).toBe(false); // done today
    // Down at 3 a.m., started at noon: made up right away; never made one: likewise.
    expect(isDue(berlin('2026-10-19T10:00:00Z'), at3, 'Europe/Berlin', '2026-10-17')).toBe(true);
    expect(isDue(berlin('2026-10-19T10:00:00Z'), at3, 'Europe/Berlin', undefined)).toBe(true);
  });
});

describe('daily backups', () => {
  it('writes a restorable archive named by the local day and records it', async () => {
    const { file, size } = await runDailyBackup({ db, uploadsDir, backupsDir, keep: 14, timeZone: 'Europe/Berlin', now: new Date('2026-10-18T23:30:00Z') });
    expect(path.basename(file)).toBe('scrumbanize-backup-2026-10-19.zip');
    expect(fs.readdirSync(daily())).toEqual(['scrumbanize-backup-2026-10-19.zip']);
    expect(size).toBe(fs.statSync(file).size);

    const unpacked = path.join(dir, 'unpacked');
    await extractBackup(file, unpacked);
    expect(validateBackup(unpacked).manifest).toMatchObject({ app: 'scrumbanize' });

    expect(readDailyBackupState(db)).toEqual({ lastDate: '2026-10-19', lastAt: '2026-10-18T23:30:00.000Z', lastFile: 'scrumbanize-backup-2026-10-19.zip', lastSize: size });
  });

  it('keeps only the newest ones and leaves other files alone', async () => {
    fs.mkdirSync(daily(), { recursive: true });
    for (let day = 1; day <= 16; day++) fs.writeFileSync(path.join(daily(), `scrumbanize-backup-2026-10-${String(day).padStart(2, '0')}.zip`), '');
    fs.writeFileSync(path.join(daily(), 'notiz.txt'), '');
    expect(await pruneDailyBackups(daily(), 14)).toEqual(['scrumbanize-backup-2026-10-01.zip', 'scrumbanize-backup-2026-10-02.zip']);
    expect(fs.readdirSync(daily())).toHaveLength(15);
    expect(fs.existsSync(path.join(daily(), 'notiz.txt'))).toBe(true);
  });

  it('records a failure, which /api/health then reports, until the next success', async () => {
    fs.writeFileSync(backupsDir, ''); // a file where the folder should be
    await expect(runDailyBackup({ db, uploadsDir, backupsDir, keep: 14, timeZone: 'UTC' })).rejects.toThrow();
    expect(lastBackupFailed(readDailyBackupState(db))).toBe(true);

    fs.rmSync(backupsDir);
    expect(healthReport(db, backupsDir, null)).toMatchObject({ status: 'degraded', backups: 'failing' });
    await runDailyBackup({ db, uploadsDir, backupsDir, keep: 14, timeZone: 'UTC' });
    expect(lastBackupFailed(readDailyBackupState(db))).toBe(false);
    expect(healthReport(db, backupsDir, null)).toMatchObject({ status: 'ok', backups: 'ok' });
  });

  it('runs on schedule: right away when due, once per day, and not at all when switched off', async () => {
    let now = new Date('2026-10-19T08:00:00Z');
    const log: string[] = [];
    const schedule = { time: at3, keep: 14, timeZone: 'UTC' };
    const backups = startDailyBackups({ db, uploadsDir, backupsDir, schedule, log: (m) => log.push(m), now: () => now });
    await backups.check(); // the check at start is still running; this waits for it
    expect(fs.readdirSync(daily())).toEqual(['scrumbanize-backup-2026-10-19.zip']);
    await backups.check();
    expect(log.filter((m) => m.startsWith('Daily backup written'))).toHaveLength(1);

    now = new Date('2026-10-20T02:59:00Z');
    await backups.check();
    now = new Date('2026-10-20T03:00:00Z');
    await backups.check();
    expect(fs.readdirSync(daily())).toEqual(['scrumbanize-backup-2026-10-19.zip', 'scrumbanize-backup-2026-10-20.zip']);
    await backups.stop();

    const off = startDailyBackups({ db, uploadsDir, backupsDir: path.join(dir, 'off'), schedule: { ...schedule, time: null } });
    await off.check();
    await off.stop();
    expect(fs.existsSync(path.join(dir, 'off'))).toBe(false);
  });

  it('warns at start when the folder cannot be written', async () => {
    fs.writeFileSync(backupsDir, '');
    const log: string[] = [];
    const backups = startDailyBackups({ db, uploadsDir, backupsDir, schedule: { time: at3, keep: 14, timeZone: 'UTC' }, log: (m) => log.push(m) });
    await backups.stop();
    expect(log[0]).toMatch(/cannot be written.*chown 1000:1000/);
  });

  it('leaves no half-written archive when a backup fails', async () => {
    const file = path.join(backupsDir, 'x.zip');
    db.close();
    await expect(writeBackupFile(db, uploadsDir, file)).rejects.toThrow();
    expect(fs.readdirSync(backupsDir)).toEqual([]);
  });
});

describe('backup before an update', () => {
  const oldDatabase = (file: string, version: number) => {
    const old = new Database(file);
    for (const sql of migrations.slice(0, version)) old.exec(sql);
    old.pragma(`user_version = ${version}`);
    old.close();
  };

  it('copies a database an update will migrate, keeping the newest five', () => {
    const dbFile = path.join(dir, 'scrumbanize.db');
    oldDatabase(dbFile, 10);
    const copies: string[] = [];
    for (let minute = 0; minute < UPDATE_COPIES_KEPT + 2; minute++) {
      copies.push(backupBeforeUpdate(dbFile, backupsDir, new Date(Date.UTC(2026, 9, 19, 10, minute)))!);
    }
    expect(path.basename(copies[0]!)).toBe('vor-update-v10-2026-10-19T10-00-00.db');
    const kept = fs.readdirSync(backupsDir).sort();
    expect(kept).toEqual(copies.slice(-UPDATE_COPIES_KEPT).map((c) => path.basename(c)).sort());
    const copy = new Database(copies.at(-1)!, { readonly: true });
    expect(copy.pragma('user_version', { simple: true })).toBe(10);
    copy.close();
  });

  it('copies nothing for a new or current database', () => {
    expect(backupBeforeUpdate(path.join(dir, 'missing.db'), backupsDir)).toBeUndefined();
    const dbFile = path.join(dir, 'current.db');
    openDatabase(dbFile).close();
    expect(backupBeforeUpdate(dbFile, backupsDir)).toBeUndefined();
    expect(fs.existsSync(backupsDir)).toBe(false);
  });
});

describe('GET /api/backup/status', () => {
  it('shows the schedule, the last backup and a failure after it', async () => {
    const app = createApp(db, { uploadsDir, backupSchedule: { time: { hour: 3, minute: 5 }, keep: 14, timeZone: 'Europe/Berlin' } });
    expect((await request(app).get('/api/backup/status')).body).toEqual({
      schedule: { time: '03:05', keep: 14, timeZone: 'Europe/Berlin' },
      folder: 'ok',
      last: null,
      error: null,
    });
    const { size } = await runDailyBackup({ db, uploadsDir, backupsDir, keep: 14, timeZone: 'Europe/Berlin', now: new Date('2026-10-19T01:05:00Z') });
    expect((await request(app).get('/api/backup/status')).body.last).toEqual({ at: '2026-10-19T01:05:00.000Z', file: 'scrumbanize-backup-2026-10-19.zip', size });
  });

  it('has no schedule where daily backups are off or not set up (desktop app)', async () => {
    expect((await request(createApp(db, { uploadsDir })).get('/api/backup/status')).body.schedule).toBeNull();
  });
});
