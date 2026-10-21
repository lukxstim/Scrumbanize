import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../src/database.js';
import { createUsersRepository } from '../src/repositories/usersRepository.js';
import { handshakeAllowed } from '../src/realtime/server.js';
import { startServer, type RunningServer } from '../src/start.js';

/** US-24: live updates over Socket.io, against a running server with login. */

let dataDir: string;
let server: RunningServer;
let db: Db;
let sockets: Socket[];
const cookie: Record<'owner' | 'member' | 'outsider', string> = { owner: '', member: '', outsider: '' };
const userId: Record<'owner' | 'member' | 'outsider', number> = { owner: 0, member: 0, outsider: 0 };
/** The owner's project, with the member in it, and a task on its board. */
let projectId: number;
let task: { id: number; columnId: number; laneId: number };
let columns: { id: number }[];

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-realtime-'));
  server = await startServer({ port: 0, host: '127.0.0.1', dataDir, auth: 'required' });
  // A second connection to the same database, to set up accounts as the tests need them.
  db = openDatabase(server.dbFile);
  const users = createUsersRepository(db);
  const now = new Date().toISOString();
  for (const who of ['owner', 'member', 'outsider'] as const) {
    userId[who] = (
      db
        .prepare(`INSERT INTO users (email, name, password_hash, system_role, created_at, updated_at) VALUES (?, ?, 'x', 'user', ?, ?) RETURNING id`)
        .get(`${who}@example.com`, who, now, now) as { id: number }
    ).id;
    cookie[who] = `scrumbanize_session=${users.createSession(userId[who], 'test').token}`;
  }
  projectId = ((await (await api('owner', 'POST', '/projects', { name: 'Team', color: 'indigo' })).json()) as { id: number }).id;
  users.addMember(projectId, userId.member, 'member');
  task = (await (await api('owner', 'POST', `/projects/${projectId}/tasks`, { title: 'Erster', description: '' })).json()) as typeof task;
  columns = ((await (await api('owner', 'GET', `/projects/${projectId}/board`)).json()) as { columns: { id: number }[] }).columns;
  sockets = [];
});

afterEach(async () => {
  for (const socket of sockets) socket.disconnect();
  db.close();
  await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function open(headers: Record<string, string>, transports: ('websocket' | 'polling')[] = ['websocket'], clientId?: string): Socket {
  const socket = connect(server.url, { extraHeaders: headers, transports, reconnection: false, forceNew: true, auth: clientId ? { clientId } : {} });
  sockets.push(socket);
  return socket;
}

/** Connected, or the reason it was refused. */
function connected(socket: Socket): Promise<'ok' | string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('ok'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

function next<T = unknown>(socket: Socket, event: string, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${timeout} ms`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Everything a socket receives on `event` during `ms`. */
async function collect(socket: Socket, event: string, ms = 300): Promise<unknown[]> {
  const received: unknown[] = [];
  const listener = (payload: unknown) => received.push(payload);
  socket.on(event, listener);
  await new Promise((resolve) => setTimeout(resolve, ms));
  socket.off(event, listener);
  return received;
}

function api(who: keyof typeof cookie, method: string, url: string, body?: object, headers: Record<string, string> = {}) {
  return fetch(`${server.url}/api${url}`, {
    method,
    headers: { Cookie: cookie[who], 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('live connection', () => {
  it('refuses connections without a session', async () => {
    expect(await connected(open({}))).toBe('unauthenticated');
    expect(await connected(open({ Cookie: 'scrumbanize_session=nope' }))).toBe('unauthenticated');
  });

  it('refuses pages of other sites', async () => {
    const result = await connected(open({ Cookie: cookie.owner, Origin: 'https://evil.example' }, ['polling']));
    expect(result).not.toBe('ok');
  });

  it('works over polling, where WebSockets are blocked', async () => {
    expect(await connected(open({ Cookie: cookie.member }, ['polling']))).toBe('ok');
  });

  it("sends a change to the project's members only, with ids and the author but no content", async () => {
    const member = open({ Cookie: cookie.member });
    const outsider = open({ Cookie: cookie.outsider });
    expect(await connected(member)).toBe('ok');
    expect(await connected(outsider)).toBe('ok');
    const target = columns.find((c) => c.id !== task.columnId)!;

    const change = next<Record<string, unknown>>(member, 'change');
    const outsiderEvents = collect(outsider, 'change');
    const res = await api('owner', 'POST', `/tasks/${task.id}/move`, { columnId: target.id, laneId: task.laneId, index: 0 }, { 'X-Client-Id': 'tab-1' });
    expect(res.status).toBe(200);

    expect(await change).toEqual({
      type: 'task.moved',
      taskId: task.id,
      projectId,
      actor: { id: userId.owner, name: 'owner', avatarColor: expect.any(String), avatarUrl: null },
      originId: 'tab-1',
      at: expect.any(String),
    });
    expect(await outsiderEvents).toEqual([]);
  });

  it('announces nothing for a failed request', async () => {
    const member = open({ Cookie: cookie.member });
    expect(await connected(member)).toBe('ok');
    const events = collect(member, 'change');
    expect((await api('owner', 'PATCH', '/tasks/999999', { title: 'x' })).status).toBe(404);
    expect((await api('owner', 'PATCH', `/tasks/${task.id}`, { title: '' })).status).toBe(400);
    expect(await events).toEqual([]);
  });

  it('tells a removed member, then stops sending them changes', async () => {
    const member = open({ Cookie: cookie.member });
    expect(await connected(member)).toBe('ok');
    const removal = next<{ type: string }>(member, 'change');
    const projectsChanged = next(member, 'projects');
    expect((await api('owner', 'DELETE', `/projects/${projectId}/members/${userId.member}`)).status).toBe(204);
    expect((await removal).type).toBe('members.changed');
    await projectsChanged;

    const later = collect(member, 'change');
    expect((await api('owner', 'PATCH', `/tasks/${task.id}`, { title: 'Neu' })).status).toBe(200);
    expect(await later).toEqual([]);
  });

  it('gives a new member the project right away', async () => {
    const outsider = open({ Cookie: cookie.outsider });
    expect(await connected(outsider)).toBe('ok');
    const projectsChanged = next(outsider, 'projects');
    expect((await api('owner', 'POST', `/projects/${projectId}/members`, { email: 'outsider@example.com', role: 'viewer' })).status).toBe(201);
    await projectsChanged;

    const change = next<{ type: string }>(outsider, 'change');
    await api('owner', 'PATCH', `/tasks/${task.id}`, { title: 'Neu' });
    expect((await change).type).toBe('task.updated');
  });

  it('ends the connections of a session that logged out', async () => {
    const tab = open({ Cookie: cookie.member });
    expect(await connected(tab)).toBe('ok');
    const ended = next(tab, 'session-ended');
    const closed = next(tab, 'disconnect');
    expect((await api('member', 'POST', '/auth/logout')).status).toBe(204);
    await ended;
    await closed;
  });

  it('announces a task made from a note in the note’s project, too', async () => {
    const member = open({ Cookie: cookie.member });
    expect(await connected(member)).toBe('ok');
    const created = next(member, 'change');
    const note = (await (await api('owner', 'POST', `/projects/${projectId}/notes`, { title: 'Idee', content: '', tags: [] })).json()) as { id: number };
    await created;
    const events = collect(member, 'change');
    expect((await api('owner', 'POST', `/projects/${projectId}/tasks`, { title: 'Aus Notiz', description: '', sourceNoteId: note.id })).status).toBe(201);
    expect(((await events) as { type: string }[]).map((e) => e.type)).toEqual(['task.created', 'note.tasks']);
  });
});

type Viewers = { projectId: number; viewers: { user: { id: number }; items: { type: string; id: number }[] }[] };
type Locks = { projectId: number; locks: { item: { type: string; id: number }; user: { id: number }; clientId: string }[] };
type Answer = { ok: boolean; holder?: { user: { id: number } } | null };

/** The next presence or lock state of the project that satisfies `match`. */
function nextState<T extends { projectId: number }>(socket: Socket, event: 'presence' | 'locks', match: (state: T) => boolean, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`no matching "${event}" within ${timeout} ms`));
    }, timeout);
    const listener = (state: T) => {
      if (state.projectId !== projectId || !match(state)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(state);
    };
    socket.on(event, listener);
  });
}

const acquire = (socket: Socket, item: { type: 'note' | 'task'; id: number }, force = false) =>
  socket.timeout(2000).emitWithAck('lock:acquire', { item, force }) as Promise<Answer>;

describe('presence and locks', () => {
  const taskItem = () => ({ type: 'task' as const, id: task.id });

  it("shows who is in the project and what they have open, to the project's members only", async () => {
    const owner = open({ Cookie: cookie.owner });
    const member = open({ Cookie: cookie.member });
    const outsider = open({ Cookie: cookie.outsider });
    for (const socket of [owner, member, outsider]) expect(await connected(socket)).toBe('ok');

    const seen = nextState<Viewers>(member, 'presence', (s) => s.viewers.length === 1);
    const outsiderSaw = collect(outsider, 'presence');
    owner.emit('presence:view', { projectId, item: taskItem() });
    expect((await seen).viewers).toEqual([{ user: expect.objectContaining({ id: userId.owner, name: 'owner' }), items: [taskItem()] }]);
    expect(await outsiderSaw).toEqual([]);

    // Gone with the connection.
    const left = nextState<Viewers>(member, 'presence', (s) => s.viewers.length === 0);
    owner.disconnect();
    await left;
  });

  it('ignores projects the page may not see and items of other projects', async () => {
    const outsider = open({ Cookie: cookie.outsider });
    const member = open({ Cookie: cookie.member });
    expect(await connected(outsider)).toBe('ok');
    expect(await connected(member)).toBe('ok');
    const memberSaw = collect(member, 'presence');
    outsider.emit('presence:view', { projectId, item: null });
    expect(await memberSaw).toEqual([]);

    const seen = nextState<Viewers>(member, 'presence', (s) => s.viewers.length === 1);
    member.emit('presence:view', { projectId, item: { type: 'task', id: 999999 } });
    expect((await seen).viewers[0].items).toEqual([]);
  });

  it('a new page gets the presence and locks already there', async () => {
    const owner = open({ Cookie: cookie.owner }, ['websocket'], 'owner-tab');
    expect(await connected(owner)).toBe('ok');
    owner.emit('presence:view', { projectId, item: taskItem() });
    expect(await acquire(owner, taskItem())).toEqual({ ok: true });

    const member = open({ Cookie: cookie.member });
    const presence = nextState<Viewers>(member, 'presence', () => true);
    const locks = nextState<Locks>(member, 'locks', () => true);
    expect(await connected(member)).toBe('ok');
    expect((await presence).viewers.map((v) => v.user.id)).toEqual([userId.owner]);
    expect((await locks).locks).toEqual([expect.objectContaining({ item: taskItem(), clientId: 'owner-tab', user: expect.objectContaining({ id: userId.owner }) })]);
  });

  it('refuses a held lock with its holder; "Trotzdem bearbeiten" takes it over', async () => {
    const owner = open({ Cookie: cookie.owner }, ['websocket'], 'owner-tab');
    const member = open({ Cookie: cookie.member }, ['websocket'], 'member-tab');
    expect(await connected(owner)).toBe('ok');
    expect(await connected(member)).toBe('ok');

    expect(await acquire(owner, taskItem())).toEqual({ ok: true });
    expect(await acquire(member, taskItem())).toEqual({ ok: false, holder: expect.objectContaining({ user: expect.objectContaining({ id: userId.owner }) }) });

    const takenOver = nextState<Locks>(owner, 'locks', (s) => s.locks[0]?.clientId === 'member-tab');
    expect(await acquire(member, taskItem(), true)).toEqual({ ok: true });
    await takenOver;
  });

  it('gives a lock free when released, when its tab closes, and when the item is deleted', async () => {
    const owner = open({ Cookie: cookie.owner });
    const member = open({ Cookie: cookie.member });
    expect(await connected(owner)).toBe('ok');
    expect(await connected(member)).toBe('ok');
    const note = (await (await api('owner', 'POST', `/projects/${projectId}/notes`, { title: 'Idee', content: '', tags: [] })).json()) as { id: number };
    const noteItem = { type: 'note' as const, id: note.id };

    expect(await acquire(owner, noteItem)).toEqual({ ok: true });
    let free = nextState<Locks>(member, 'locks', (s) => s.locks.length === 0);
    owner.emit('lock:release', noteItem);
    await free;

    expect(await acquire(member, noteItem)).toEqual({ ok: true });
    free = nextState<Locks>(owner, 'locks', (s) => s.locks.length === 0);
    expect((await api('owner', 'DELETE', `/notes/${note.id}`)).status).toBe(204);
    await free;

    expect(await acquire(owner, taskItem())).toEqual({ ok: true });
    free = nextState<Locks>(member, 'locks', (s) => s.locks.length === 0);
    owner.disconnect();
    await free;
  });

  it('viewers and outsiders never hold a lock', async () => {
    createUsersRepository(db).addMember(projectId, userId.outsider, 'viewer');
    const viewer = open({ Cookie: cookie.outsider });
    expect(await connected(viewer)).toBe('ok');
    expect(await acquire(viewer, taskItem())).toEqual({ ok: false, holder: null });
    expect(await acquire(viewer, { type: 'note', id: 999999 })).toEqual({ ok: false, holder: null });
  });

  it('a removed member leaves the presence and loses their locks', async () => {
    const member = open({ Cookie: cookie.member });
    const owner = open({ Cookie: cookie.owner });
    expect(await connected(member)).toBe('ok');
    expect(await connected(owner)).toBe('ok');
    member.emit('presence:view', { projectId, item: taskItem() });
    expect(await acquire(member, taskItem())).toEqual({ ok: true });

    const gone = nextState<Locks>(owner, 'locks', (s) => s.locks.length === 0);
    const left = nextState<Viewers>(owner, 'presence', (s) => !s.viewers.some((v) => v.user.id === userId.member));
    expect((await api('owner', 'DELETE', `/projects/${projectId}/members/${userId.member}`)).status).toBe(204);
    await gone;
    await left;
  });
});

describe('handshakeAllowed', () => {
  const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;

  it('with login: own address, configured origins, or no browser', () => {
    const options = { auth: 'required' as const, allowedOrigins: ['https://scrum.example'] };
    expect(handshakeAllowed(req({ host: 'localhost:3000', origin: 'http://localhost:3000' }), options)).toBe(true);
    expect(handshakeAllowed(req({ host: 'internal:3000', origin: 'https://scrum.example' }), options)).toBe(true);
    expect(handshakeAllowed(req({ host: 'localhost:3000' }), options)).toBe(true);
    expect(handshakeAllowed(req({ host: 'localhost:3000', origin: 'https://evil.example' }), options)).toBe(false);
    expect(handshakeAllowed(req({ host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' }), options)).toBe(false);
  });

  it("desktop app: only the app's own window", () => {
    const options = { auth: 'local' as const, trustedHosts: () => ['127.0.0.1:4000', 'localhost:4000'] };
    expect(handshakeAllowed(req({ host: '127.0.0.1:4000', origin: 'http://127.0.0.1:4000' }), options)).toBe(true);
    expect(handshakeAllowed(req({ host: 'rebind.example:4000', origin: 'http://rebind.example:4000' }), options)).toBe(false);
    expect(handshakeAllowed(req({ host: '127.0.0.1:4000', origin: 'https://evil.example' }), options)).toBe(false);
  });
});
