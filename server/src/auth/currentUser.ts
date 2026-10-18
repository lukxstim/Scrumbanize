import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The user of the current request (US-21), set by the authentication middleware. Repositories read it where a change
 * belongs to someone (a new project gets its creator as owner; activity entries name their author) without every
 * function having to take a user id.
 */
const storage = new AsyncLocalStorage<number>();

export function runAsUser<T>(userId: number, fn: () => T): T {
  return storage.run(userId, fn);
}

/** Undefined outside a request, e.g. while seeding the sample project or in tests that call repositories directly. */
export function currentUserId(): number | undefined {
  return storage.getStore();
}
