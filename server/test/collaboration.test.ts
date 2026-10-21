import { beforeEach, describe, expect, it } from 'vitest';
import { createCollaboration, LOCK_IDLE_MS, type Collaboration, type Holder } from '../src/realtime/collaboration.js';

/** US-24: presence and soft locks in memory, with a clock the tests move. */

let clock: number;
let collaboration: Collaboration;
const person = (id: number, name: string) => ({ id, name, avatarColor: 'indigo' as const, avatarUrl: null });
const lukas = person(1, 'Lukas');
const anna = person(2, 'Anna');
const tab = (socketId: string, user = lukas): Holder => ({ socketId, clientId: `client-${socketId}`, user });
const note = { type: 'note' as const, id: 7 };

beforeEach(() => {
  clock = Date.parse('2026-10-21T10:00:00Z');
  collaboration = createCollaboration(() => clock);
});

describe('presence', () => {
  it('lists each person once, with what all their tabs show', () => {
    expect([...collaboration.view(tab('a'), { projectId: 1, item: null })]).toEqual([1]);
    collaboration.view(tab('b'), { projectId: 1, item: note });
    collaboration.view(tab('c', anna), { projectId: 1, item: { type: 'task', id: 3 } });

    expect(collaboration.viewers(1)).toEqual([
      { user: anna, items: [{ type: 'task', id: 3 }] },
      { user: lukas, items: [note] },
    ]);
  });

  it('moving to another project changes both; the same place again changes nothing', () => {
    collaboration.view(tab('a'), { projectId: 1, item: null });
    expect([...collaboration.view(tab('a'), { projectId: 2, item: null })].sort()).toEqual([1, 2]);
    expect(collaboration.viewers(1)).toEqual([]);
    expect(collaboration.view(tab('a'), { projectId: 2, item: null }).size).toBe(0);
  });

  it('a closed connection is gone from presence and gives its locks free', () => {
    collaboration.view(tab('a'), { projectId: 1, item: note });
    collaboration.acquire(tab('a'), 1, note);
    expect([...collaboration.leave('a')]).toEqual([1]);
    expect(collaboration.viewers(1)).toEqual([]);
    expect(collaboration.locksOf(1)).toEqual([]);
  });
});

describe('locks', () => {
  it('refuses a second tab while the first one edits, naming the holder', () => {
    expect(collaboration.acquire(tab('a'), 1, note)).toEqual({ result: { ok: true }, changed: true });
    expect(collaboration.acquire(tab('b', anna), 1, note).result).toEqual({
      ok: false,
      holder: { item: note, user: lukas, clientId: 'client-a', since: '2026-10-21T10:00:00.000Z' },
    });
    // The same person in another tab is refused, too: two editors of one text would overwrite each other.
    expect(collaboration.acquire(tab('c'), 1, note).result.ok).toBe(false);
  });

  it('"Trotzdem bearbeiten" takes the lock over', () => {
    collaboration.acquire(tab('a'), 1, note);
    expect(collaboration.acquire(tab('b', anna), 1, note, true)).toEqual({ result: { ok: true }, changed: true });
    expect(collaboration.locksOf(1).map((lock) => lock.user)).toEqual([anna]);
    // The former holder can no longer give it free.
    expect(collaboration.release('a', note)).toBeUndefined();
  });

  it('ends after 60 s without input; typing keeps it', () => {
    collaboration.acquire(tab('a'), 1, note);
    clock += LOCK_IDLE_MS - 1000;
    expect(collaboration.acquire(tab('a'), 1, note).changed).toBe(false); // renewed
    clock += LOCK_IDLE_MS - 1000;
    expect(collaboration.expire().size).toBe(0);
    clock += 1000;
    expect([...collaboration.expire()]).toEqual([1]);
    expect(collaboration.locksOf(1)).toEqual([]);
  });

  it('an idle lock no longer keeps others out, even before the sweep', () => {
    collaboration.acquire(tab('a'), 1, note);
    clock += LOCK_IDLE_MS;
    expect(collaboration.acquire(tab('b', anna), 1, note).result.ok).toBe(true);
  });

  it('is given free by its holder, and dropped with the item', () => {
    collaboration.acquire(tab('a'), 1, note);
    expect(collaboration.release('b', note)).toBeUndefined();
    expect(collaboration.release('a', note)).toBe(1);
    collaboration.acquire(tab('a'), 1, note);
    expect(collaboration.dropItem(note)).toBe(1);
    expect(collaboration.locksOf(1)).toEqual([]);
  });

  it('leaving one project ends only the locks there', () => {
    collaboration.acquire(tab('a'), 1, note);
    collaboration.acquire(tab('a'), 2, { type: 'task', id: 9 });
    expect([...collaboration.leave('a', 2)]).toEqual([2]);
    expect(collaboration.locksOf(1)).toHaveLength(1);
  });
});
