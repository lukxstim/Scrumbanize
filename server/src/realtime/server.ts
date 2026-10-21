import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { createAccess } from '../auth/access.js';
import { sessionTokenOf, type AuthMode } from '../auth/middleware.js';
import type { Db } from '../database.js';
import { createUsersRepository, type User } from '../repositories/usersRepository.js';
import { createCollaboration, type AcquireResult, type ItemRef, type LockInfo, type Viewer } from './collaboration.js';
import type { Actor, ChangeEvent, RealtimeHub, RealtimeMessage } from './events.js';

/** How often every connection checks its session and projects again, besides the checks after changes. */
const RECHECK_INTERVAL_MS = 60_000;
/** How often locks are checked for their 60 s without input. */
const EXPIRE_INTERVAL_MS = 5_000;

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
  /** Who is in the project and what they have open; sent when it changes and when the page joins the project. */
  presence: (payload: { projectId: number; viewers: Viewer[] }) => void;
  /** The project's locks, the same way. */
  locks: (payload: { projectId: number; locks: LockInfo[] }) => void;
}

/** Refused without a holder: the item is not there, or the user may not change it. */
export type LockAnswer = AcquireResult | { ok: false; holder: null };

/** Presence and locks (US-24), only with login: without it, everyone would be the same local user. */
interface ClientToServer {
  /** The page shows this project (and this note or task); null: none. */
  'presence:view': (location: unknown) => void;
  /** Takes or renews the lock of `{ item, force }`; the answer says whether this page may edit. */
  'lock:acquire': (request: unknown, answer: (result: LockAnswer) => void) => void;
  'lock:release': (item: unknown) => void;
}

const itemSchema = z.object({ type: z.enum(['note', 'task']), id: z.number().int().positive() });
const locationSchema = z.object({ projectId: z.number().int().positive(), item: itemSchema.nullable() }).nullable();
const acquireSchema = z.object({ item: itemSchema, force: z.boolean().default(false) });
const CLIENT_ID = /^[\w-]{1,64}$/;

interface SocketData {
  user: User;
  /** The session cookie, to check now and then whether the session still exists. Undefined without login. */
  token?: string;
  /** Rooms were joined once; later changes are announced to the page. */
  synced?: boolean;
  /** The browser tab (as X-Client-Id), so it knows its own locks. */
  clientId: string;
}

type LiveSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export const projectRoom = (projectId: number) => `project:${projectId}`;
const roomProject = (room: string) => Number(room.slice('project:'.length));

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
  const collaboration = createCollaboration();
  const withPresence = options.auth === 'required';
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
    const clientId = (socket.handshake.auth as { clientId?: unknown }).clientId;
    Object.assign(socket.data, { user, token, clientId: typeof clientId === 'string' && CLIENT_ID.test(clientId) ? clientId : socket.id });
    next();
  });

  const actorOf = (user: User): Actor => ({ id: user.id, name: user.name, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl });
  const holderOf = (socket: LiveSocket) => ({ socketId: socket.id, clientId: socket.data.clientId, user: actorOf(socket.data.user) });

  /** Sends the projects' presence and locks to everyone in them. */
  function announce(projectIds: Iterable<number>): void {
    for (const projectId of projectIds) {
      io.to(projectRoom(projectId)).emit('presence', { projectId, viewers: collaboration.viewers(projectId) });
      io.to(projectRoom(projectId)).emit('locks', { projectId, locks: collaboration.locksOf(projectId) });
    }
  }

  /** Joins the rooms of the user's projects and leaves the others; tells the page when its projects changed. */
  function syncRooms(socket: LiveSocket): void {
    const wanted = new Set([...access.projectIds(socket.data.user)].map(projectRoom));
    let changed = false;
    for (const room of socket.rooms) {
      if (room.startsWith('project:') && !wanted.has(room)) {
        void socket.leave(room);
        changed = true;
        // Out of the project: no longer shown there, and its locks there end.
        if (withPresence) announce(collaboration.leave(socket.id, roomProject(room)));
      }
    }
    for (const room of wanted) {
      if (!socket.rooms.has(room)) {
        void socket.join(room);
        changed = true;
        // Who is already there, for the project switcher and the pages.
        if (withPresence) {
          const projectId = roomProject(room);
          socket.emit('presence', { projectId, viewers: collaboration.viewers(projectId) });
          socket.emit('locks', { projectId, locks: collaboration.locksOf(projectId) });
        }
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

  /** The project of a note or task (also in the trash); undefined if there is none. */
  const projectOfItem = (item: ItemRef) => access.trashProject(item.type, item.id);

  io.on('connection', (socket: LiveSocket) => {
    syncRooms(socket);
    if (!withPresence) return;

    socket.on('presence:view', (raw) => {
      const parsed = locationSchema.safeParse(raw);
      if (!parsed.success) return;
      const location = parsed.data;
      // Only projects the page may see, and only items of that project.
      if (location && !socket.rooms.has(projectRoom(location.projectId))) return;
      if (location?.item && projectOfItem(location.item) !== location.projectId) location.item = null;
      announce(collaboration.view(holderOf(socket), location));
    });

    socket.on('lock:acquire', (raw, answer) => {
      if (typeof answer !== 'function') return;
      const parsed = acquireSchema.safeParse(raw);
      const projectId = parsed.success ? projectOfItem(parsed.data.item) : undefined;
      // Members and owners edit; viewers never hold a lock.
      if (!parsed.success || projectId === undefined || !access.has(access.roleIn(socket.data.user, projectId), 'member')) {
        answer({ ok: false, holder: null });
        return;
      }
      const { result, changed } = collaboration.acquire(holderOf(socket), projectId, parsed.data.item, parsed.data.force);
      answer(result);
      if (changed) announce([projectId]);
    });

    socket.on('lock:release', (raw) => {
      const parsed = itemSchema.safeParse(raw);
      const projectId = parsed.success ? collaboration.release(socket.id, parsed.data) : undefined;
      if (projectId !== undefined) announce([projectId]);
    });

    // A closed tab, lost network or logout: its presence and locks end right away.
    socket.on('disconnect', () => announce(collaboration.leave(socket.id)));
  });

  const unsubscribe = options.hub.subscribe((message: RealtimeMessage) => {
    switch (message.kind) {
      case 'change': {
        const { projectId, event, actor, originId, at } = message;
        io.to(projectRoom(projectId)).emit('change', { ...event, projectId, actor, originId, at });
        // A note or task that went away takes its lock with it.
        const gone = goneItem(event);
        const lockProject = gone && collaboration.dropItem(gone);
        if (lockProject !== undefined) announce([lockProject]);
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
  // Locks nobody typed in for 60 s are free again.
  const expiry = setInterval(() => announce(collaboration.expire()), EXPIRE_INTERVAL_MS);
  expiry.unref();

  return {
    close() {
      clearInterval(timer);
      clearInterval(expiry);
      unsubscribe();
      io.disconnectSockets(true);
      // Ends polling clients and the WebSocket server; the HTTP server itself is closed by its owner.
      io.engine.close();
    },
  };
}

/** The note or task a change removed (trash or purge), if any. */
function goneItem(event: ChangeEvent): ItemRef | undefined {
  switch (event.type) {
    case 'note.deleted':
    case 'note.purged':
      return { type: 'note', id: event.noteId };
    case 'task.deleted':
    case 'task.purged':
      return { type: 'task', id: event.taskId };
    default:
      return undefined;
  }
}
