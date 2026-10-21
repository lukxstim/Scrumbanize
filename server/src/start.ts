import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { createApp, type DesktopInfo } from './app.js';
import type { AuthMode } from './auth/middleware.js';
import { backupBeforeUpdate, backupsDirOf } from './backup.js';
import { startDailyBackups, type BackupSchedule } from './dailyBackup.js';
import { DB_FILE_NAME, openDatabase, UPLOADS_DIR_NAME } from './database.js';
import { seedSampleNotebookOnce } from './sampleNotebook.js';
import { seedSampleProject } from './sampleProject.js';
import { loopbackHosts } from './hostGuard.js';
import { createRealtimeHub } from './realtime/events.js';
import { attachRealtime } from './realtime/server.js';

export interface ServerOptions {
  /** Port to listen on; 0 picks a free one. */
  port: number;
  /** Interface to listen on. Omitted: all interfaces (dev, Docker). The desktop app uses "127.0.0.1". */
  host?: string;
  /** If the port is busy, fall back to a free one instead of failing (desktop app). */
  fallbackToFreePort?: boolean;
  /** Directory of the SQLite database `scrumbanize.db`; created if missing. */
  dataDir: string;
  /** The built client, served by the same server. */
  clientDist?: string;
  /**
   * Only accept requests from the app's own window (Host and Origin checks, see hostGuard.ts).
   * Requires `host: '127.0.0.1'`. Off for dev and Docker, which are reached via other host names.
   */
  localOnly?: boolean;
  /** The desktop app passes its version and release page, for the reminder to look for new versions. */
  desktop?: DesktopInfo;
  /** `required`: login (web, Docker, dev). `local`: no login, everyone is the local user (desktop app, AUTH=off). */
  auth: AuthMode;
  /** Receives the one-time code for setting up the first administrator, e.g. to print it. */
  onSetupCode?: (code: string) => void;
  /** Origins besides the server's own address whose pages may send changes (BASE_URL). */
  allowedOrigins?: readonly string[];
  /** Express "trust proxy" (TRUST_PROXY), when a reverse proxy terminates HTTPS. */
  trustProxy?: boolean | number | string;
  /** The app's version, for /api/health (US-23). */
  version?: string;
  /** Daily backups into `<dataDir>/backups/taeglich` (US-23: BACKUP_TIME, BACKUP_KEEP, TZ). Omitted: none (desktop app). */
  backups?: BackupSchedule;
}

export interface RunningServer {
  /** The address the app's window should load, e.g. http://127.0.0.1:41723. */
  url: string;
  port: number;
  dbFile: string;
  /** Stops accepting requests, ends open connections and closes the database. Safe to call twice. */
  close: () => Promise<void>;
  /**
   * The same at once, without waiting for anything (a daily backup still being written is abandoned): for a computer
   * that is shutting down, which must not be held up. Also finishes a `close()` that is still waiting.
   */
  closeNow: () => void;
}

export { DB_FILE_NAME, UPLOADS_DIR_NAME } from './database.js';

/**
 * Opens the database and starts the HTTP server. Used by the CLI entry point (index.ts: dev, Docker,
 * `npm start`) and by the Electron main process. Rejects (and closes the database again) if the server
 * cannot listen.
 */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  if (options.localOnly && options.host !== '127.0.0.1') {
    throw new Error('localOnly requires host "127.0.0.1"');
  }

  const dbFile = path.join(path.resolve(options.dataDir), DB_FILE_NAME);
  const uploadsDir = path.join(path.resolve(options.dataDir), UPLOADS_DIR_NAME);
  const backupsDir = backupsDirOf(path.resolve(options.dataDir));
  // An update that changes the schema keeps a copy of the database as it was (US-23). If that fails (e.g. the backup
  // folder is not writable), the update still goes ahead: the server must come up, and /api/health reports the folder.
  try {
    const copy = backupBeforeUpdate(dbFile, backupsDir);
    if (copy) console.log(`Database backed up before the update: ${copy}`);
  } catch (error) {
    console.warn(`Warning: no backup before the update (${error instanceof Error ? error.message : String(error)}); updating anyway.`);
  }
  // A brand-new database starts with the sample project (US-13); updates of existing ones never get it.
  const db = openDatabase(dbFile, { onCreate: (created) => seedSampleProject(created) });
  // Wissen (US-22) starts with a sample notebook, also on existing installations – once, never again after deleting.
  seedSampleNotebookOnce(db);

  // The guard needs the actual port, which is only known after listening.
  let actualPort = options.port;
  const trustedHosts = options.localOnly ? () => loopbackHosts(actualPort) : undefined;
  const realtime = createRealtimeHub();
  const app = createApp(db, {
    clientDist: options.clientDist,
    uploadsDir,
    desktop: options.desktop,
    trustedHosts,
    auth: options.auth,
    onSetupCode: options.onSetupCode,
    allowedOrigins: options.allowedOrigins,
    trustProxy: options.trustProxy,
    version: options.version ?? options.desktop?.version,
    backupSchedule: options.backups,
    realtime,
  });

  let server: Server;
  try {
    try {
      server = await listen(app, options.port, options.host);
    } catch (error) {
      if (!(options.fallbackToFreePort && isAddressInUse(error))) throw error;
      server = await listen(app, 0, options.host);
    }
  } catch (error) {
    db.close();
    throw error;
  }

  const address = server.address();
  actualPort = typeof address === 'object' && address ? address.port : options.port;
  const urlHost = !options.host || options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
  // Live updates (US-24) on the same server and port.
  const live = attachRealtime(server, { db, hub: realtime, auth: options.auth, allowedOrigins: options.allowedOrigins, trustedHosts });
  const daily = options.backups ? startDailyBackups({ db, uploadsDir, backupsDir, schedule: options.backups }) : undefined;

  let dbClosed = false;
  const closeDb = () => {
    if (dbClosed) return;
    dbClosed = true;
    db.close(); // also checkpoints the WAL into the database file
  };
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= new Promise<void>((resolve) => {
      live.close();
      server.close(() => {
        // A backup still being written finishes before the database closes.
        void (daily?.stop() ?? Promise.resolve()).then(() => {
          closeDb();
          resolve();
        });
      });
      // Keep-alive connections (e.g. of the app window) would otherwise keep the server open.
      server.closeAllConnections();
    }));
  const closeNow = () => {
    live.close();
    server.close();
    server.closeAllConnections();
    void daily?.stop();
    closeDb();
    closing ??= Promise.resolve();
  };

  return { url: `http://${urlHost}:${actualPort}`, port: actualPort, dbFile, close, closeNow };
}

function listen(app: ReturnType<typeof createApp>, port: number, host: string | undefined): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
    if (host === undefined) server.listen(port);
    else server.listen(port, host);
  });
}

function isAddressInUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EADDRINUSE';
}
