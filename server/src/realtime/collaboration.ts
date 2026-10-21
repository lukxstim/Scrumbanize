import type { Actor } from './events.js';

/** A note, or a task's title and description, that someone looks at or edits. */
export interface ItemRef {
  type: 'note' | 'task';
  id: number;
}

/** Who is in a project right now (US-24), once per person, with what their open pages show. */
export interface Viewer {
  user: Actor;
  /** The notes and tasks open in their pages; empty while they look at a list, the board or elsewhere in the project. */
  items: ItemRef[];
}

/** Someone edits an item: others see it read-only, with "Trotzdem bearbeiten". */
export interface LockInfo {
  item: ItemRef;
  user: Actor;
  /** The browser tab holding it (its X-Client-Id): another tab of the same person sees the lock, too. */
  clientId: string;
  since: string;
}

export type AcquireResult = { ok: true } | { ok: false; holder: LockInfo };

/** A lock ends after this long without input (or renewal) from its holder. */
export const LOCK_IDLE_MS = 60_000;

/** One open page: its connection, person and tab. */
export interface Holder {
  socketId: string;
  clientId: string;
  user: Actor;
}

interface Lock extends LockInfo {
  projectId: number;
  socketId: string;
  renewedAt: number;
}

const keyOf = (item: ItemRef) => `${item.type}:${item.id}`;
const sameItem = (a: ItemRef | null, b: ItemRef | null) => (a && keyOf(a)) === (b && keyOf(b));

/**
 * Presence and soft locks (US-24), in memory: a small team on one instance needs nothing shared, and a restart ends
 * every connection anyway. Pure state, without Socket.io; every change returns the projects whose state the pages
 * should get again.
 */
export function createCollaboration(now: () => number = Date.now) {
  /** Per connection: the project it shows and the item open there. */
  const locations = new Map<string, { projectId: number; item: ItemRef | null; user: Actor }>();
  const locks = new Map<string, Lock>();

  function viewers(projectId: number): Viewer[] {
    const byUser = new Map<number, Viewer>();
    for (const location of locations.values()) {
      if (location.projectId !== projectId) continue;
      const viewer = byUser.get(location.user.id) ?? { user: location.user, items: [] };
      byUser.set(location.user.id, viewer);
      if (location.item && !viewer.items.some((i) => keyOf(i) === keyOf(location.item!))) viewer.items.push(location.item);
    }
    return [...byUser.values()].sort((a, b) => a.user.name.localeCompare(b.user.name) || a.user.id - b.user.id);
  }

  function locksOf(projectId: number): LockInfo[] {
    return [...locks.values()]
      .filter((lock) => lock.projectId === projectId)
      .map(({ item, user, clientId, since }) => ({ item, user, clientId, since }));
  }

  /** Locks whose holder was idle too long; returns their projects. */
  function expire(): Set<number> {
    const changed = new Set<number>();
    const limit = now() - LOCK_IDLE_MS;
    for (const [key, lock] of locks) {
      if (lock.renewedAt <= limit) {
        locks.delete(key);
        changed.add(lock.projectId);
      }
    }
    return changed;
  }

  return {
    viewers,
    locksOf,
    expire,

    /** Where a connection is now (null: in no project, e.g. Wissen's overview or the profile). Returns the projects that changed. */
    view(holder: Holder, location: { projectId: number; item: ItemRef | null } | null): Set<number> {
      const before = locations.get(holder.socketId);
      // Nothing to send when nothing moved (e.g. the same page announced again after a reconnect).
      if (before && location && before.projectId === location.projectId && sameItem(before.item, location.item)) return new Set();
      const changed = new Set<number>();
      if (before) changed.add(before.projectId);
      if (location) {
        locations.set(holder.socketId, { ...location, user: holder.user });
        changed.add(location.projectId);
      } else {
        locations.delete(holder.socketId);
      }
      return changed;
    },

    /**
     * Takes the item's lock, or renews it if this tab holds it. Held by someone else and not idle too long: refused
     * with the holder, unless `force` ("Trotzdem bearbeiten"), which takes it over.
     */
    acquire(holder: Holder, projectId: number, item: ItemRef, force = false): { result: AcquireResult; changed: boolean } {
      const key = keyOf(item);
      const current = locks.get(key);
      const at = now();
      if (current && current.socketId === holder.socketId) {
        current.renewedAt = at;
        return { result: { ok: true }, changed: false };
      }
      if (current && current.renewedAt > at - LOCK_IDLE_MS && !force) {
        const { user, clientId, since } = current;
        return { result: { ok: false, holder: { item: current.item, user, clientId, since } }, changed: false };
      }
      locks.set(key, {
        item: { type: item.type, id: item.id },
        user: holder.user,
        clientId: holder.clientId,
        since: new Date(at).toISOString(),
        projectId,
        socketId: holder.socketId,
        renewedAt: at,
      });
      return { result: { ok: true }, changed: true };
    },

    /** Gives the item free if this connection holds it; returns its project then. */
    release(socketId: string, item: ItemRef): number | undefined {
      const lock = locks.get(keyOf(item));
      if (!lock || lock.socketId !== socketId) return undefined;
      locks.delete(keyOf(item));
      return lock.projectId;
    },

    /** The item is gone (trash, purged): its lock, too. */
    dropItem(item: ItemRef): number | undefined {
      const lock = locks.get(keyOf(item));
      locks.delete(keyOf(item));
      return lock?.projectId;
    },

    /**
     * A connection left a project (lost access) or closed altogether (`projectId` undefined): its presence and locks
     * there end. Returns the projects that changed.
     */
    leave(socketId: string, projectId?: number): Set<number> {
      const changed = new Set<number>();
      const location = locations.get(socketId);
      if (location && (projectId === undefined || location.projectId === projectId)) {
        locations.delete(socketId);
        changed.add(location.projectId);
      }
      for (const [key, lock] of locks) {
        if (lock.socketId === socketId && (projectId === undefined || lock.projectId === projectId)) {
          locks.delete(key);
          changed.add(lock.projectId);
        }
      }
      return changed;
    },
  };
}

export type Collaboration = ReturnType<typeof createCollaboration>;
