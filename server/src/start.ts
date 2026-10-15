import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { loopbackHosts } from './hostGuard.js';

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
}

export interface RunningServer {
  /** The address the app's window should load, e.g. http://127.0.0.1:41723. */
  url: string;
  port: number;
  dbFile: string;
  /** Stops accepting requests, ends open connections and closes the database. Safe to call twice. */
  close: () => Promise<void>;
}

export const DB_FILE_NAME = 'scrumbanize.db';
/** Attachment files, next to the database. */
export const UPLOADS_DIR_NAME = 'uploads';

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
  const db = openDatabase(dbFile);

  // The guard needs the actual port, which is only known after listening.
  let actualPort = options.port;
  const app = createApp(db, {
    clientDist: options.clientDist,
    uploadsDir,
    trustedHosts: options.localOnly ? () => loopbackHosts(actualPort) : undefined,
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

  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= new Promise<void>((resolve) => {
      server.close(() => {
        db.close(); // also checkpoints the WAL into the database file
        resolve();
      });
      // Keep-alive connections (e.g. of the app window) would otherwise keep the server open.
      server.closeAllConnections();
    }));

  return { url: `http://${urlHost}:${actualPort}`, port: actualPort, dbFile, close };
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
