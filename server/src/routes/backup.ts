import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { backupFileName, MAX_BACKUP_SIZE, writeBackup, type RestoreService } from '../backup.js';
import { isWritableDir, lastBackupFailed, readDailyBackupState, type BackupSchedule } from '../dailyBackup.js';
import type { Db } from '../database.js';
import { HttpError } from '../errors.js';
import { attachmentDisposition } from '../exports.js';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Backup of the whole instance and its restore in two steps (check, then replace), and the state of the daily
 * backups (US-23). Mounted at /api/backup.
 */
export function backupRouter(options: {
  db: Db;
  uploadsDir: string;
  backupsDir: string;
  schedule: BackupSchedule | undefined;
  restore: RestoreService;
  access: Access;
}): Router {
  const { db, uploadsDir, backupsDir, schedule, restore, access } = options;
  const router = Router();
  // A backup holds every project of every user, and a restore replaces them all: administrators only (US-21).
  router.use(access.requireSystemAdmin);

  /** The daily backups: when they run, the last one, and the last failure if it came after it. */
  router.get('/status', (_req, res) => {
    const state = readDailyBackupState(db);
    res.json({
      schedule:
        schedule?.time == null
          ? null
          : { time: `${pad(schedule.time.hour)}:${pad(schedule.time.minute)}`, keep: schedule.keep, timeZone: schedule.timeZone },
      folder: isWritableDir(backupsDir) ? 'ok' : 'not_writable',
      last: state.lastAt ? { at: state.lastAt, file: state.lastFile ?? null, size: state.lastSize ?? null } : null,
      error: lastBackupFailed(state) ? { at: state.errorAt, message: state.error ?? '' } : null,
    });
  });

  router.get('/', async (_req, res) => {
    const now = new Date();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', attachmentDisposition(backupFileName(now)));
    try {
      await writeBackup(db, uploadsDir, res, now);
    } catch (error) {
      // The archive is streamed, so once it has begun the status cannot change anymore; end the download broken.
      if (!res.headersSent) throw error;
      console.error(error);
      res.destroy();
    }
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, done) => done(null, restore.uploadDir()),
      filename: (_req, _file, done) => done(null, `${randomUUID()}.zip`),
    }),
    limits: { fileSize: MAX_BACKUP_SIZE, files: 1 },
  }).single('file');

  const receive: RequestHandler = (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'file_too_large', 'The backup is larger than 2 GB'));
        return next(new HttpError(400, 'invalid_upload', error.message));
      }
      next(error);
    });
  };

  /** Step 1: upload, unpack and check; answers with what the backup contains and a token for step 2. */
  router.post('/restore', receive, async (req, res) => {
    if (!req.file) throw new HttpError(400, 'no_files', 'No backup in field "file"');
    res.json(await restore.prepare(req.file.path));
  });

  /** Step 2: replace all data with the checked backup. */
  router.post('/restore/:token', async (req, res) => {
    res.json(await restore.apply(String(req.params.token), new Date(), userOf(res)?.id));
  });

  router.delete('/restore/:token', (req, res) => {
    restore.cancel(String(req.params.token));
    res.status(204).end();
  });

  return router;
}
