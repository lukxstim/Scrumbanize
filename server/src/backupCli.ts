import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backupsDirOf, writeBackup, writeBackupFile } from './backup.js';
import { ConfigError, ensureTempDir, loadConfig } from './config.js';
import { DB_FILE_NAME, type Db, UPLOADS_DIR_NAME } from './database.js';

/**
 * A backup right now, from the command line (US-23), while the server keeps running:
 *
 *   docker compose exec scrumbanize node server/dist/backupCli.js            → backups/manuell/scrumbanize-backup-<time>.zip
 *   docker compose exec scrumbanize node server/dist/backupCli.js --out FILE → that file (inside the container)
 *   docker compose exec -T scrumbanize node server/dist/backupCli.js --out - > backup.zip → straight to the host
 *
 * The same ZIP as "Backup herunterladen", so it can be restored in the app's settings. The database is opened read-only
 * and never migrated, so this does not interfere with the running server. Messages go to stderr, so `--out -` stays clean.
 */

const MANUAL_DIR_NAME = 'manuell';

function usage(): never {
  console.error('Usage: node server/dist/backupCli.js [--out <file> | --out -]');
  process.exit(2);
}

const args = process.argv.slice(2);
let out: string | undefined;
if (args.length > 0) {
  if (args[0] !== '--out' || args.length !== 2) usage();
  out = args[1];
}

const repoRoot = path.resolve(import.meta.dirname, '../..');
let dataDir: string;
try {
  dataDir = loadConfig(process.env, repoRoot).config.dataDir;
  ensureTempDir(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const dbFile = path.join(dataDir, DB_FILE_NAME);
if (!fs.existsSync(dbFile)) {
  console.error(`No database at ${dbFile} (DATA_DIR).`);
  process.exit(1);
}
const db = new Database(dbFile, { readonly: true, fileMustExist: true }) as Db;
const uploadsDir = path.join(dataDir, UPLOADS_DIR_NAME);

try {
  const now = new Date();
  if (out === '-') {
    const manifest = await writeBackup(db, uploadsDir, process.stdout, now);
    console.error(`Backup written to stdout: ${manifest.counts.projects} projects, ${manifest.counts.notes} notes, ${manifest.counts.tasks} tasks.`);
  } else {
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.resolve(out ?? path.join(backupsDirOf(dataDir), MANUAL_DIR_NAME, `scrumbanize-backup-${stamp}.zip`));
    const { manifest, size } = await writeBackupFile(db, uploadsDir, file, now);
    console.error(
      `Backup written: ${file} (${(size / 1024 / 1024).toFixed(1)} MB; ${manifest.counts.projects} projects, ${manifest.counts.notes} notes, ${manifest.counts.tasks} tasks)`,
    );
  }
} catch (error) {
  console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  db.close();
}
