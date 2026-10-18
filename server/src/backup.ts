/**
 * Backup and restore of the whole instance (US-16): a ZIP with the database, the attachment files and a manifest.
 * A restore replaces the data inside the open database connection (in one transaction), so the server keeps running
 * and all prepared statements stay valid.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import Database from 'better-sqlite3';
import { Unzip, UnzipInflate } from 'fflate';
import { DB_FILE_NAME, migrations, openDatabase, UPLOADS_DIR_NAME, type Db } from './database.js';
import { HttpError } from './errors.js';
import { createZipStream, isCompressible } from './zipStream.js';

export const MANIFEST_NAME = 'manifest.json';
/** Largest backup archive accepted for a restore. */
export const MAX_BACKUP_SIZE = 2 * 1024 ** 3;
/** Largest total size of the unpacked files (guards against archives that unpack to far more than they weigh). */
export const MAX_UNPACKED_SIZE = 4 * 1024 ** 3;
/** Safety copies made before a restore that are kept in `<dataDir>/backups`. */
export const SAFETY_COPIES_KEPT = 5;
export const SAFETY_COPY_PREFIX = 'vor-wiederherstellung-';

export interface BackupCounts {
  projects: number;
  notes: number;
  tasks: number;
  attachments: number;
}

export interface BackupManifest {
  app: 'scrumbanize';
  /** Version of this archive layout. */
  format: 1;
  /** The database's schema version (PRAGMA user_version). */
  schemaVersion: number;
  createdAt: string;
  /** Outside the trash. */
  counts: BackupCounts;
}

function countData(db: Db): BackupCounts {
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    projects: count(`SELECT COUNT(*) AS n FROM live_projects`),
    notes: count(`SELECT COUNT(*) AS n FROM live_notes`),
    tasks: count(`SELECT COUNT(*) AS n FROM live_tasks`),
    attachments: count(`SELECT COUNT(*) AS n FROM attachments`),
  };
}

/**
 * Logins are not data: sessions and one-time links (invitations, password resets) never go into a backup, and a
 * restore does not bring any back – everyone logs in again afterwards (US-21).
 */
export const TABLES_NOT_BACKED_UP = ['sessions', 'auth_tokens'] as const;

export const backupFileName = (now: Date) => `scrumbanize-backup-${now.toISOString().slice(0, 10)}.zip`;

/**
 * Writes a backup ZIP into `out`: a consistent snapshot of the database (VACUUM INTO works while the app is in use),
 * the files of all attachments, and the manifest.
 */
export async function writeBackup(db: Db, uploadsDir: string, out: Writable, now = new Date()): Promise<BackupManifest> {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'scrumbanize-backup-'));
  try {
    const snapshot = path.join(tmpDir, DB_FILE_NAME);
    db.prepare(`VACUUM INTO ?`).run(snapshot);
    const copy = new Database(snapshot);
    try {
      for (const table of TABLES_NOT_BACKED_UP) {
        if (copy.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)) copy.exec(`DELETE FROM ${table}`);
      }
      copy.exec('VACUUM');
    } finally {
      copy.close();
    }
    const manifest: BackupManifest = {
      app: 'scrumbanize',
      format: 1,
      schemaVersion: db.pragma('user_version', { simple: true }) as number,
      createdAt: now.toISOString(),
      counts: countData(db),
    };
    // The files of attachments and the profile pictures (US-21c).
    const storedNames = (
      db.prepare(`SELECT stored_name FROM attachments UNION ALL SELECT avatar_file FROM users WHERE avatar_file IS NOT NULL`).all() as {
        stored_name: string;
      }[]
    ).map((r) => r.stored_name);

    const zip = createZipStream(out);
    await zip.addText(MANIFEST_NAME, `${JSON.stringify(manifest, null, 2)}\n`);
    await zip.addFile(DB_FILE_NAME, snapshot, true);
    for (const name of storedNames) {
      const file = path.join(uploadsDir, name);
      // A file lost on disk does not stop the backup; the restore reports it as missing.
      if (fs.existsSync(file)) await zip.addFile(`${UPLOADS_DIR_NAME}/${name}`, file, isCompressible(name));
    }
    await zip.end();
    return manifest;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

const invalid = (message: string) => new HttpError(400, 'invalid_backup', message);

/**
 * Where an archive entry may be unpacked, relative to the target folder: only the manifest, the database and plain
 * files directly in uploads/. Null for folder entries. Anything else (other paths, "..", absolute paths) is refused.
 */
export function entryTarget(name: string): string | null {
  if (name === `${UPLOADS_DIR_NAME}/`) return null;
  if (name === MANIFEST_NAME || name === DB_FILE_NAME) return name;
  const match = new RegExp(`^${UPLOADS_DIR_NAME}/([^/\\\\:]+)$`).exec(name);
  // Stored names are random ids with an extension: never "." or "..", never control characters.
  if (match && !/^\.{1,2}$/.test(match[1]!) && !/[\u0000-\u001f]/.test(match[1]!)) return name;
  throw invalid(`Unexpected file in the archive: ${name.slice(0, 120)}`);
}

/** Unpacks the archive into `target`, streaming, with the rules of entryTarget and a limit on the unpacked size. */
export async function extractBackup(zipFile: string, target: string): Promise<void> {
  const open = new Set<number>();
  let unpacked = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((entry) => {
    if (failure) return;
    let relative: string | null;
    try {
      relative = entryTarget(entry.name);
    } catch (error) {
      failure = error as Error;
      return;
    }
    if (relative === null) return;
    const dest = path.join(target, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let fd: number;
    try {
      fd = fs.openSync(dest, 'wx'); // a second entry with the same name fails here
    } catch {
      failure = invalid(`Duplicate file in the archive: ${relative}`);
      return;
    }
    open.add(fd);
    entry.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        failure = invalid('The archive is damaged');
        return;
      }
      unpacked += data.length;
      if (unpacked > MAX_UNPACKED_SIZE) {
        failure = invalid('The archive unpacks to more than allowed');
        return;
      }
      fs.writeSync(fd, data);
      if (final) {
        fs.closeSync(fd);
        open.delete(fd);
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const chunk of fs.createReadStream(zipFile)) {
      unzip.push(chunk as Uint8Array);
      if (failure) throw failure;
    }
    unzip.push(new Uint8Array(0), true);
    if (failure) throw failure;
    if (open.size > 0) throw invalid('The archive is incomplete');
  } catch (error) {
    throw error instanceof HttpError ? error : invalid('The file is not a valid ZIP archive');
  } finally {
    for (const fd of open) fs.closeSync(fd);
  }
}

/**
 * Checks an unpacked backup and brings its database to the current schema. Throws for anything that is not a
 * Scrumbanize database, a damaged one, or one from a newer version of the app.
 */
export function validateBackup(dir: string): { manifest: BackupManifest | null; counts: BackupCounts; missingFiles: number } {
  const dbFile = path.join(dir, DB_FILE_NAME);
  if (!fs.existsSync(dbFile)) throw invalid(`The archive contains no ${DB_FILE_NAME}`);

  let manifest: BackupManifest | null = null;
  const manifestFile = path.join(dir, MANIFEST_NAME);
  if (fs.existsSync(manifestFile)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as BackupManifest;
    } catch {
      throw invalid('The manifest of the archive is damaged');
    }
    if (manifest?.app !== 'scrumbanize') throw invalid('The archive is not a Scrumbanize backup');
  }

  let check: Database.Database;
  try {
    check = new Database(dbFile, { readonly: true, fileMustExist: true });
  } catch {
    throw invalid('The database in the archive cannot be opened');
  }
  const damaged = () => invalid('The database in the archive is damaged or not a Scrumbanize database');
  try {
    // A file that is not a database at all only fails on the first read.
    let version: number;
    let ok: unknown;
    let hasProjects: unknown;
    try {
      version = check.pragma('user_version', { simple: true }) as number;
      ok = check.pragma('integrity_check', { simple: true });
      hasProjects = check.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get();
    } catch {
      throw damaged();
    }
    if (version > migrations.length) {
      throw new HttpError(400, 'backup_too_new', 'The backup comes from a newer version of Scrumbanize');
    }
    if (ok !== 'ok' || version === 0 || !hasProjects) throw damaged();
  } finally {
    check.close();
  }

  // Older backups get the migrations of this version, so the copy below sees the same tables and columns.
  const migrated = openDatabase(dbFile);
  try {
    const stored = (migrated.prepare(`SELECT stored_name FROM attachments`).all() as { stored_name: string }[]).map((r) => r.stored_name);
    const missingFiles = stored.filter((name) => !fs.existsSync(path.join(dir, UPLOADS_DIR_NAME, name))).length;
    return { manifest, counts: countData(migrated), missingFiles };
  } finally {
    migrated.close();
  }
}

/**
 * Replaces all rows of the live database with those of `sourceFile` (same schema version) in one transaction.
 * Foreign keys are checked at the end; if anything fails, nothing changes.
 */
export function replaceData(db: Db, sourceFile: string): void {
  db.prepare(`ATTACH DATABASE ? AS restore`).run(sourceFile);
  try {
    const tables = (
      db.prepare(`SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    const columns = (schema: string, table: string) =>
      (db.prepare(`SELECT name FROM pragma_table_info(?, ?)`).all(table, schema) as { name: string }[]).map((r) => r.name);
    const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
    const hasSequence = (schema: string) =>
      db.prepare(`SELECT 1 FROM ${schema}.sqlite_master WHERE name = 'sqlite_sequence'`).get() !== undefined;

    db.transaction(() => {
      db.pragma('defer_foreign_keys = ON');
      for (const table of tables) db.exec(`DELETE FROM main.${quote(table)}`);
      for (const table of tables) {
        if ((TABLES_NOT_BACKED_UP as readonly string[]).includes(table)) continue;
        const shared = columns('restore', table);
        if (shared.length === 0) continue;
        const list = columns('main', table)
          .filter((c) => shared.includes(c))
          .map(quote)
          .join(', ');
        db.exec(`INSERT INTO main.${quote(table)} (${list}) SELECT ${list} FROM restore.${quote(table)}`);
      }
      if (hasSequence('main')) {
        db.exec(`DELETE FROM main.sqlite_sequence`);
        if (hasSequence('restore')) db.exec(`INSERT INTO main.sqlite_sequence (name, seq) SELECT name, seq FROM restore.sqlite_sequence`);
      }
      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) throw invalid(`The backup has ${violations.length} broken references`);
    })();
  } finally {
    db.exec(`DETACH DATABASE restore`);
  }
}

interface RestorerRow {
  email: string;
  name: string;
  password_hash: string | null;
  avatar_color: string;
}

/**
 * A backup without an administrator who can log in – from the desktop app, or from before US-21 – would lock everyone
 * out of a server with login. Then the administrator who restored it is kept (same email and password, without
 * picture, whose file is gone with the old uploads) and becomes owner of every restored project, as after the setup.
 * Their sessions are gone like everyone's, so they log in again. Returns whether that happened.
 */
export function keepRestoringAdmin(db: Db, restorer: RestorerRow | undefined, now = new Date()): boolean {
  if (!restorer?.password_hash) return false;
  const admins = db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE system_role = 'admin' AND password_hash IS NOT NULL AND disabled_at IS NULL`)
    .get() as { n: number };
  if (admins.n > 0) return false;
  const stamp = now.toISOString();
  db.transaction(() => {
    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(restorer.email) as { id: number } | undefined;
    const id = existing
      ? (db
          .prepare(`UPDATE users SET name = ?, password_hash = ?, system_role = 'admin', disabled_at = NULL, updated_at = ? WHERE id = ? RETURNING id`)
          .get(restorer.name, restorer.password_hash, stamp, existing.id) as { id: number }).id
      : (db
          .prepare(`INSERT INTO users (email, name, password_hash, system_role, avatar_color, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?, ?) RETURNING id`)
          .get(restorer.email, restorer.name, restorer.password_hash, restorer.avatar_color, stamp, stamp) as { id: number }).id;
    db.prepare(
      `INSERT INTO project_members (project_id, user_id, role, created_at) SELECT id, ?, 'owner', ? FROM projects WHERE true
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner'`,
    ).run(id, stamp);
  })();
  return true;
}

export interface PreparedRestore {
  token: string;
  manifest: BackupManifest | null;
  counts: BackupCounts;
  missingFiles: number;
}

export type RestoreService = ReturnType<typeof createRestoreService>;

/**
 * Two steps, so the user sees what a backup contains before anything is replaced: `prepare` unpacks and checks an
 * uploaded archive, `apply` replaces the data with it. At most one prepared backup waits at a time.
 */
export function createRestoreService(options: { db: Db; uploadsDir: string; onRestored: () => void }) {
  const { db, uploadsDir } = options;
  const dataDir = path.dirname(uploadsDir);
  /** Uploads and unpacked archives; left-overs from a crash are removed on start. */
  const workDir = path.join(dataDir, '.restore');
  const backupsDir = path.join(dataDir, 'backups');
  fs.rmSync(workDir, { recursive: true, force: true });
  let pending: (PreparedRestore & { dir: string }) | null = null;
  let busy = false;

  const discard = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

  async function writeSafetyCopy(now: Date): Promise<string> {
    await fsp.mkdir(backupsDir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(backupsDir, `${SAFETY_COPY_PREFIX}${stamp}.zip`);
    await writeBackup(db, uploadsDir, fs.createWriteStream(file), now);
    // Keep the newest few; names sort by time.
    const copies = (await fsp.readdir(backupsDir)).filter((n) => n.startsWith(SAFETY_COPY_PREFIX) && n.endsWith('.zip')).sort();
    for (const old of copies.slice(0, -SAFETY_COPIES_KEPT)) await fsp.rm(path.join(backupsDir, old), { force: true });
    return file;
  }

  return {
    /** Folder for uploaded archives (multer writes there). */
    uploadDir(): string {
      fs.mkdirSync(workDir, { recursive: true });
      return workDir;
    },

    /** Unpacks and checks the uploaded archive (which is removed afterwards). */
    async prepare(zipFile: string): Promise<PreparedRestore> {
      if (busy) throw new HttpError(409, 'restore_busy', 'A restore is already running');
      busy = true;
      const dir = path.join(workDir, randomUUID());
      try {
        if (pending) discard(pending.dir);
        pending = null;
        await extractBackup(zipFile, dir);
        const checked = validateBackup(dir);
        pending = { token: randomUUID(), ...checked, dir };
        const { dir: _dir, ...result } = pending;
        return result;
      } catch (error) {
        discard(dir);
        throw error;
      } finally {
        await fsp.rm(zipFile, { force: true });
        busy = false;
      }
    },

    /**
     * Replaces all data with the prepared backup, after a safety copy of the current state. `restoredBy`: the
     * administrator restoring it, who is kept when the backup has no administrator that can log in (see
     * keepRestoringAdmin).
     */
    async apply(token: string, now = new Date(), restoredBy?: number): Promise<{ counts: BackupCounts; safetyCopy: string; keptAdmin: boolean }> {
      if (busy) throw new HttpError(409, 'restore_busy', 'A restore is already running');
      if (!pending || pending.token !== token) throw new HttpError(404, 'restore_expired', 'The prepared backup is gone; upload it again');
      busy = true;
      const prepared = pending;
      pending = null;
      const restorer = restoredBy === undefined ? undefined : (db.prepare(`SELECT * FROM users WHERE id = ?`).get(restoredBy) as RestorerRow | undefined);
      try {
        const safetyCopy = await writeSafetyCopy(now);

        // Files first (the old folder stays until the data is in), then the data; a failure puts the files back.
        const stamp = now.getTime();
        const oldUploads = `${uploadsDir}.old-${stamp}`;
        const hadUploads = fs.existsSync(uploadsDir);
        if (hadUploads) fs.renameSync(uploadsDir, oldUploads);
        const newUploads = path.join(prepared.dir, UPLOADS_DIR_NAME);
        if (fs.existsSync(newUploads)) fs.renameSync(newUploads, uploadsDir);
        else fs.mkdirSync(uploadsDir, { recursive: true });
        try {
          replaceData(db, path.join(prepared.dir, DB_FILE_NAME));
        } catch (error) {
          fs.rmSync(uploadsDir, { recursive: true, force: true });
          if (hadUploads) fs.renameSync(oldUploads, uploadsDir);
          throw error;
        }
        if (hadUploads) discard(oldUploads);
        const keptAdmin = keepRestoringAdmin(db, restorer, now);
        options.onRestored();
        return { counts: prepared.counts, safetyCopy: path.basename(safetyCopy), keptAdmin };
      } finally {
        discard(prepared.dir);
        busy = false;
      }
    },

    cancel(token: string): void {
      if (pending?.token === token) {
        discard(pending.dir);
        pending = null;
      }
    },
  };
}
