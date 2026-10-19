import type { Db } from './database.js';
import { isWritableDir, lastBackupFailed, readDailyBackupState } from './dailyBackup.js';

/**
 * GET /api/health (US-23), for Docker's health check, Caddy and outside monitoring. Public and cheap; it tells whether
 * the server can serve requests (the database answers) and whether backups work, without any details a stranger
 * could use.
 */
export interface HealthReport {
  /** `degraded`: the app works, but something needs attention (backups). */
  status: 'ok' | 'degraded' | 'error';
  version: string | null;
  database: 'ok' | 'error';
  /** `not_writable`: the backup folder cannot be written; `failing`: the last daily backup failed. */
  backups: 'ok' | 'not_writable' | 'failing';
}

function databaseAnswers(db: Db): boolean {
  try {
    return db.prepare('SELECT 1 AS ok').get() !== undefined;
  } catch {
    return false;
  }
}

export function healthReport(db: Db, backupsDir: string, version: string | null): HealthReport {
  const database = databaseAnswers(db) ? 'ok' : 'error';
  const backups = !isWritableDir(backupsDir) ? 'not_writable' : database === 'ok' && lastBackupFailed(readDailyBackupState(db)) ? 'failing' : 'ok';
  return { status: database === 'error' ? 'error' : backups === 'ok' ? 'ok' : 'degraded', version, database, backups };
}
