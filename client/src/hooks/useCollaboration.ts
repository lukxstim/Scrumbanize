import { useCallback, useEffect, useRef } from 'react';
import type { ItemRef, LockInfo, RealtimeActor } from '../types/realtime';
import { clientId, goneMessage, othersIn, viewersOf } from '../utils/realtime';
import { useAuth } from './useAuth';
import { useCollaborationState, useRealtimeProject } from './useRealtime';
import { useToast } from './useToast';

/** How often typing renews a lock; the server frees it after 60 s without. */
const RENEW_MS = 15_000;
/** Focus may leave the editor for a moment (a menu, the link picker) without giving the lock free. */
const BLUR_RELEASE_MS = 1500;

const NO_ONE: RealtimeActor[] = [];

/** The others in a project right now (US-24), for the header and the project switcher; empty without login. */
export function useProjectPresence(projectId: number | undefined): RealtimeActor[] {
  const collaboration = useCollaborationState();
  const me = useAuth().session?.user?.id;
  if (!collaboration?.enabled || projectId === undefined) return NO_ONE;
  return othersIn(collaboration.presence[projectId], me);
}

/** The others in each of the user's projects, for the project switcher. */
export function useAllPresence(): (projectId: number) => RealtimeActor[] {
  const collaboration = useCollaborationState();
  const me = useAuth().session?.user?.id;
  return (projectId) => (collaboration?.enabled ? othersIn(collaboration.presence[projectId], me) : NO_ONE);
}

/** The others who have this note or task open, for its card or list entry. */
export function useItemViewers(projectId: number, item: ItemRef): RealtimeActor[] {
  const collaboration = useCollaborationState();
  const me = useAuth().session?.user?.id;
  if (!collaboration?.enabled) return NO_ONE;
  return viewersOf(collaboration.presence[projectId], item, me);
}

/** Tells the others which project this page shows (null: none). */
export function useShowProject(projectId: number | null): void {
  const showProject = useCollaborationState()?.showProject;
  useEffect(() => {
    showProject?.(projectId);
  }, [showProject, projectId]);
  useEffect(() => () => showProject?.(null), [showProject]);
}

/** Tells the others which note or task this page has open, while it is mounted. */
export function useShowItem(projectId: number, item: ItemRef): void {
  const showItem = useCollaborationState()?.showItem;
  const { type, id } = item;
  useEffect(() => {
    showItem?.({ projectId, item: { type, id } });
    return () => showItem?.(null);
  }, [showItem, projectId, type, id]);
}

export interface SoftLock {
  /** Someone else edits the item: show it read-only, with their name. */
  holder: LockInfo | null;
  /** Call on focus and on every input: takes the lock, or renews it now and then. */
  touch: () => void;
  /** "Trotzdem bearbeiten": takes the lock over. */
  takeOver: () => Promise<void>;
  /** Focus left the editor: gives the lock free after a moment, once `beforeRelease` (e.g. the last save) is done. */
  blur: (stillInside: () => boolean, beforeRelease?: () => Promise<void>) => void;
}

/**
 * The soft lock (US-24) of a note or a task's title and description: taken on focus or the first key, renewed while
 * typing, given free on leaving the editor or closing it; the server frees it after 60 s without input. Without
 * login (or `enabled` false, e.g. for viewers), there are no locks.
 */
export function useSoftLock(projectId: number, item: ItemRef, enabled: boolean): SoftLock {
  const collaboration = useCollaborationState();
  const active = enabled && !!collaboration?.enabled;
  const lock = active ? collaboration.locks[projectId]?.find((l) => l.item.type === item.type && l.item.id === item.id) : undefined;
  const holder = lock && lock.clientId !== clientId ? lock : null;
  const mine = lock?.clientId === clientId;
  const lastTaken = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { type, id } = item;
  const acquireLock = collaboration?.acquireLock;
  const releaseLock = collaboration?.releaseLock;
  // Freed after 60 s idle or taken over: the next key takes it again right away (if free).
  useEffect(() => {
    if (!mine) lastTaken.current = 0;
  }, [mine]);

  const touch = useCallback(() => {
    clearTimeout(blurTimer.current);
    if (!active || holder || !acquireLock) return;
    if (Date.now() - lastTaken.current < RENEW_MS) return;
    lastTaken.current = Date.now();
    void acquireLock({ type, id }).then((answer) => {
      // Refused: someone else was faster; their lock arrives with the next state and makes the editor read-only.
      if (!answer.ok) lastTaken.current = 0;
    });
  }, [active, holder, acquireLock, type, id]);

  const takeOver = useCallback(async () => {
    if (!acquireLock) return;
    const answer = await acquireLock({ type, id }, true);
    lastTaken.current = answer.ok ? Date.now() : 0;
  }, [acquireLock, type, id]);

  const release = useCallback(() => {
    if (lastTaken.current === 0) return;
    lastTaken.current = 0;
    releaseLock?.({ type, id });
  }, [releaseLock, type, id]);

  const blur = useCallback(
    (stillInside: () => boolean, beforeRelease?: () => Promise<void>) => {
      clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(() => {
        if (stillInside()) return;
        void (beforeRelease?.() ?? Promise.resolve()).finally(release);
      }, BLUR_RELEASE_MS);
    },
    [release],
  );

  // Closing the note or task gives it free.
  useEffect(
    () => () => {
      clearTimeout(blurTimer.current);
      release();
    },
    [release],
  );

  return { holder, touch, takeOver, blur };
}

/**
 * Says so when the open note or task (`id`, null: none) is deleted elsewhere (US-24); the page closes it by itself,
 * since it is gone from its list. `projectId` 'all': in every project (Wissen).
 */
export function useGoneNotice(projectId: number | 'all', type: ItemRef['type'], id: number | null): void {
  const toast = useToast();
  useRealtimeProject(id === null ? undefined : projectId, (events) => {
    const message = id === null ? null : goneMessage(events, { type, id });
    if (message) toast({ message });
  });
}
