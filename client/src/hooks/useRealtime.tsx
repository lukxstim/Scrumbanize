import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ItemRef, LockAnswer, LockInfo, RealtimeChange, RealtimeEvent, Viewer } from '../types/realtime';
import { notifyNotesChanged, notifyTrashChanged, notifyUnauthorized } from '../utils/appEvents';
import { clientId } from '../utils/realtime';
import { useAuth } from './useAuth';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

/** Besides changes: the user's projects changed (membership), or a backup was restored. */
export type RealtimeSignal = RealtimeEvent | { type: 'projects' } | { type: 'restored' };

type Listener = (signal: RealtimeSignal) => void;

interface RealtimeState {
  status: ConnectionStatus;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

/** Where this page is: a project, and maybe a note or task open in it. */
export interface PresenceLocation {
  projectId: number;
  item: ItemRef | null;
}

/** Presence and soft locks (US-24); only with login (`enabled`), since without it everyone is the same local user. */
export interface CollaborationState {
  enabled: boolean;
  /** Per project: who is there, including this user. */
  presence: Record<number, Viewer[]>;
  locks: Record<number, LockInfo[]>;
  /** The project this page shows (ProjectLayout); null: none. */
  showProject: (projectId: number | null) => void;
  /** The note or task open in this page; null when it closes. */
  showItem: (location: PresenceLocation | null) => void;
  acquireLock: (item: ItemRef, force?: boolean) => Promise<LockAnswer>;
  releaseLock: (item: ItemRef) => void;
}

const CollaborationContext = createContext<CollaborationState | null>(null);

/** Without an answer within this time (e.g. offline), editing goes ahead: the 409 check still protects the text. */
const LOCK_ANSWER_MS = 5000;

const TRASH_TYPES = new Set(['task.deleted', 'task.restored', 'task.purged', 'note.deleted', 'note.restored', 'note.purged', 'project.deleted', 'project.restored', 'project.purged', 'trash.emptied']);
const NOTE_TYPES = new Set(['note.created', 'note.updated', 'note.deleted', 'note.restored', 'note.purged', 'notes.imported']);

/** Calls `fn` once `ms` after the last call, e.g. once for a colleague's whole typing burst. */
function debounced(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const call = () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}

/**
 * The live connection (US-24) of a logged-in page: one Socket.io connection, WebSocket where possible and polling
 * where it is blocked, reconnecting by itself. After a reconnect the hooks load their data again (`resync`), since
 * changes in between were missed. Changes made by this tab are skipped; without login, authors are not shown.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const local = session?.mode === 'local';
  const listeners = useRef(new Set<Listener>());
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);
  const [presence, setPresence] = useState<Record<number, Viewer[]>>({});
  const [locks, setLocks] = useState<Record<number, LockInfo[]>>({});
  // Sent again after every reconnect, since the server forgets a closed connection's place.
  const shownProject = useRef<number | null>(null);
  const shownItem = useRef<PresenceLocation | null>(null);

  const sendLocation = useCallback(() => {
    if (local || !socketRef.current?.connected) return;
    const project = shownProject.current;
    socketRef.current.emit('presence:view', shownItem.current ?? (project === null ? null : { projectId: project, item: null }));
  }, [local]);

  useEffect(() => {
    const socket = io({ reconnectionDelayMax: 10_000, auth: { clientId } });
    socketRef.current = socket;
    const emit = (signal: RealtimeSignal) => {
      for (const listener of listeners.current) listener(signal);
    };
    // App-wide counters, at most once a second: the trash tab and the tags of Wissen.
    const trashChanged = debounced(notifyTrashChanged, 1000);
    const notesChanged = debounced(notifyNotesChanged, 1000);
    let connectedBefore = false;

    socket.on('connect', () => {
      setStatus('connected');
      sendLocation();
      if (connectedBefore) emit({ type: 'resync' });
      connectedBefore = true;
    });
    socket.on('disconnect', () => {
      setStatus('reconnecting');
      // Out of date while offline; the server sends everything again after the reconnect.
      setPresence({});
      setLocks({});
    });
    socket.on('connect_error', (error) => {
      // Refused by the server (not a network problem): the session is over, the login takes over.
      if (!socket.active && error.message === 'unauthenticated') notifyUnauthorized();
    });
    socket.on('session-ended', () => notifyUnauthorized());
    socket.on('change', (change: RealtimeChange) => {
      if (change.originId === clientId) return;
      if (TRASH_TYPES.has(change.type)) trashChanged();
      if (NOTE_TYPES.has(change.type)) notesChanged();
      emit(local ? { ...change, actor: null } : change);
    });
    socket.on('projects', () => emit({ type: 'projects' }));
    socket.on('restored', () => emit({ type: 'restored' }));
    socket.on('presence', ({ projectId, viewers }: { projectId: number; viewers: Viewer[] }) =>
      setPresence((current) => ({ ...current, [projectId]: viewers })),
    );
    socket.on('locks', ({ projectId, locks: projectLocks }: { projectId: number; locks: LockInfo[] }) =>
      setLocks((current) => ({ ...current, [projectId]: projectLocks })),
    );

    return () => {
      trashChanged.cancel();
      notesChanged.cancel();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [local, sendLocation]);

  const value = useMemo<RealtimeState>(
    () => ({
      status,
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [status],
  );

  // The actions stay the same across presence and lock updates: hooks run effects on them, which must not repeat
  // (and announce again, or give a lock free) with every update.
  const actions = useMemo<Omit<CollaborationState, 'enabled' | 'presence' | 'locks'>>(
    () => ({
      showProject: (projectId) => {
        if (shownProject.current === projectId) return;
        shownProject.current = projectId;
        sendLocation();
      },
      showItem: (location) => {
        const current = shownItem.current;
        if (current?.projectId === location?.projectId && current?.item?.type === location?.item?.type && current?.item?.id === location?.item?.id) return;
        shownItem.current = location;
        sendLocation();
      },
      acquireLock: async (item, force = false) => {
        const socket = socketRef.current;
        if (local || !socket?.connected) return { ok: true };
        try {
          return (await socket.timeout(LOCK_ANSWER_MS).emitWithAck('lock:acquire', { item, force })) as LockAnswer;
        } catch {
          return { ok: true };
        }
      },
      releaseLock: (item) => {
        if (!local) socketRef.current?.emit('lock:release', item);
      },
    }),
    [local, sendLocation],
  );
  const collaboration = useMemo<CollaborationState>(() => ({ enabled: !local, presence, locks, ...actions }), [local, presence, locks, actions]);

  return (
    <RealtimeContext.Provider value={value}>
      <CollaborationContext.Provider value={collaboration}>{children}</CollaborationContext.Provider>
    </RealtimeContext.Provider>
  );
}

/** Presence and locks; null outside the provider. */
export function useCollaborationState(): CollaborationState | null {
  return useContext(CollaborationContext);
}

/** Whether live updates arrive right now; 'connecting' outside the provider. */
export function useRealtimeStatus(): ConnectionStatus {
  return useContext(RealtimeContext)?.status ?? 'connecting';
}

/** Every signal of the live connection; does nothing outside the provider (e.g. on the login page). */
export function useRealtimeSignal(handler: Listener): void {
  const context = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const subscribe = context?.subscribe;
  useEffect(() => subscribe?.((signal) => handlerRef.current(signal)), [subscribe]);
}

/**
 * Changes made elsewhere in a project (`'all'`: in every project of the user, as in Wissen; undefined: none), plus
 * `resync` after a reconnect. Collected for `delay` ms and handed over together, so a burst (a colleague typing,
 * moving several cards) costs one update.
 */
export function useRealtimeProject(projectId: number | 'all' | undefined, onEvents: (events: RealtimeEvent[]) => void, delay = 150): void {
  const onEventsRef = useRef(onEvents);
  useEffect(() => {
    onEventsRef.current = onEvents;
  });
  const queue = useRef<RealtimeEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useRealtimeSignal((signal) => {
    if (projectId === undefined || signal.type === 'projects' || signal.type === 'restored') return;
    if (signal.type !== 'resync' && projectId !== 'all' && signal.projectId !== projectId) return;
    queue.current.push(signal);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const events = queue.current;
      queue.current = [];
      onEventsRef.current(events);
    }, delay);
  });
}
