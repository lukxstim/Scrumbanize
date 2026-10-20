import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAccess } from '../auth/access.js';
import { sessionTokenOf, type AuthMode } from '../auth/middleware.js';
import type { Db } from '../database.js';
import { createUsersRepository, type User } from '../repositories/usersRepository.js';
import type { Actor, ChangeEvent, RealtimeHub, RealtimeMessage } from './events.js';

/** How often every connection checks its session and projects again, besides the checks after changes. */
const RECHECK_INTERVAL_MS = 60_000;

export interface RealtimeOptions {
  db: Db;
  hub: RealtimeHub;
  auth: AuthMode;
  /** Origins besides the server's own address whose pages may connect (BASE_URL, ALLOWED_ORIGINS). */
  allowedOrigins?: readonly string[];
  /** Desktop app: only the app's own window may connect (as hostGuard.ts for requests). */
  trustedHosts?: () => readonly string[];
}

/** A change as the pages receive it. */
export type ChangePayload = ChangeEvent & { projectId: number; actor: Actor | null; originId: string | null; at: string };

interface ServerToClient {
  change: (payload: ChangePayload) => void;
  /** The projects the user may see changed: the page reloads its list. */
  projects: () => void;
  'session-ended': () => void;
  restored: () => void;
}

// Nothing from the pages yet; presence and locks follow (US-24b, US-24c).
type ClientToServer = Record<string, never>;

interface SocketData {
  user: User;
  /** The session cookie, to check now and then whether the session still exists. Undefined without login. */
  token?: string;
  /** Rooms were joined once; later changes are announced to the page. */
  synced?: boolean;
}

type LiveSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export const projectRoom = (projectId: number) => `project:${projectId}`;

/**
 * Whether a handshake comes from a page that may connect. Socket.io answers its requests (polling and the WebSocket
 * upgrade) before Express sees them, so hostGuard and sameOriginForChanges are repeated here.
 */
export function handshakeAllowed(req: IncomingMessage, options: Pick<RealtimeOptions, 'auth' | 'allowedOrigins' | 'trustedHosts'>): boolean {
  const host = req.headers.host?.toLowerCase();
  const origin = req.headers.origin?.toLowerCase();
  const fetchSite = req.headers['sec-fetch-site'];
  if (options.trustedHosts) {
    const hosts = options.trustedHosts();
    return !!host && hosts.includes(host) && fetchSite !== 'cross-site' && (origin === undefined || hosts.some((h) => origin === `http://${h}`));
  }
  if (options.auth === 'local') return true;
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;
  if (origin === undefined || (options.allowedOrigins ?? []).some((o) => o.toLowerCase() === origin)) return true;
  try {
    // Same host as the page's own address; behind a proxy that keeps the Host header, as Caddy does.
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Live updates (US-24): Socket.io on the app's HTTP server, falling back to polling where WebSockets are blocked.
 * Every connection is a logged-in user and sits in one room per project they may see; changes announced through the
 * hub go to that project's room. Returns `close`, which ends all connections (before the HTTP server closes).
 */
export function attachRealtime(httpServer: HttpServer, options: RealtimeOptions): { close: () => void } {
  const users = createUsersRepository(options.db);
  const access = createAccess(options.db, options.auth);
  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(httpServer, {
    serveClient: false,
    allowRequest: (req, callback) => callback(null, handshakeAllowed(req, options)),
  });

  /** The connection's user as of now; undefined if the session ended or the account was disabled. */
  function currentUser(data: Partial<SocketData>): User | undefined {
    if (options.auth === 'local') return users.localUser();
    return data.token ? users.peekSession(data.token) : undefined;
  }

  io.use((socket, next) => {
    const token = options.auth === 'local' ? undefined : sessionTokenOf(socket.request);
    const user = currentUser({ token });
    if (!user) return next(new Error('unauthenticated'));
    Object.assign(socket.data, { user, token });
    next();
  });

  /** Joins the rooms of the user's projects and leaves the others; tells the page when its projects changed. */
  function syncRooms(socket: LiveSocket): void {
    const wanted = new Set([...access.projectIds(socket.data.user)].map(projectRoom));
    let changed = false;
    for (const room of socket.rooms) {
      if (room.startsWith('project:') && !wanted.has(room)) {
        void socket.leave(room);
        changed = true;
      }
    }
    for (const room of wanted) {
      if (!socket.rooms.has(room)) {
        void socket.join(room);
        changed = true;
      }
    }
    if (changed && socket.data.synced) socket.emit('projects');
    socket.data.synced = true;
  }

  /** Checks the session again; an ended one closes the connection, and the page shows the login. */
  function recheck(socket: LiveSocket): void {
    const user = currentUser(socket.data);
    if (!user) {
      socket.emit('session-ended');
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    syncRooms(socket);
  }

  const sockets = () => [...io.of('/').sockets.values()];

  io.on('connection', (socket: LiveSocket) => syncRooms(socket));

  const unsubscribe = options.hub.subscribe((message: RealtimeMessage) => {
    switch (message.kind) {
      case 'change': {
        const { projectId, event, actor, originId, at } = message;
        io.to(projectRoom(projectId)).emit('change', { ...event, projectId, actor, originId, at });
        break;
      }
      case 'access':
        for (const socket of sockets()) {
          if (message.userIds === 'all' || message.userIds.includes(socket.data.user.id)) recheck(socket);
        }
        break;
      case 'restored':
        io.emit('restored');
        for (const socket of sockets()) recheck(socket);
        break;
    }
  });

  const timer = setInterval(() => {
    for (const socket of sockets()) recheck(socket);
  }, RECHECK_INTERVAL_MS);
  timer.unref();

  return {
    close() {
      clearInterval(timer);
      unsubscribe();
      io.disconnectSockets(true);
      // Ends polling clients and the WebSocket server; the HTTP server itself is closed by its owner.
      io.engine.close();
    },
  };
}
