import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { RealtimeChange, RealtimeEvent } from '../types/realtime';
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

  useEffect(() => {
    const socket = io({ reconnectionDelayMax: 10_000 });
    const emit = (signal: RealtimeSignal) => {
      for (const listener of listeners.current) listener(signal);
    };
    // App-wide counters, at most once a second: the trash tab and the tags of Wissen.
    const trashChanged = debounced(notifyTrashChanged, 1000);
    const notesChanged = debounced(notifyNotesChanged, 1000);
    let connectedBefore = false;

    socket.on('connect', () => {
      setStatus('connected');
      if (connectedBefore) emit({ type: 'resync' });
      connectedBefore = true;
    });
    socket.on('disconnect', () => setStatus('reconnecting'));
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

    return () => {
      trashChanged.cancel();
      notesChanged.cancel();
      socket.disconnect();
    };
  }, [local]);

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
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
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
