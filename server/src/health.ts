import fs from 'node:fs';
import type { Db } from './database.js';

/**
 * GET /api/health (US-23), for Docker's health check, Caddy and outside monitoring. Public and cheap; it tells whether
 * the server can serve requests (the database answers) and whether backups can be written, without any details a
 * stranger could use.
 */
export interface HealthReport {
  /** `degraded`: the app works, but something needs attention (backups cannot be written). */
  status: 'ok' | 'degraded' | 'error';
  version: string | null;
  database: 'ok' | 'error';
  backups: 'ok' | 'not_writable';
}

function databaseAnswers(db: Db): boolean {
  try {
    return db.prepare('SELECT 1 AS ok').get() !== undefined;
  } catch {
    return false;
  }
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

export function healthReport(db: Db, backupsDir: string, version: string | null): HealthReport {
  const database = databaseAnswers(db) ? 'ok' : 'error';
  const backups = isWritableDir(backupsDir) ? 'ok' : 'not_writable';
  return { status: database === 'error' ? 'error' : backups === 'ok' ? 'ok' : 'degraded', version, database, backups };
}
