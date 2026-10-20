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

function open(headers: Record<string, string>, transports: ('websocket' | 'polling')[] = ['websocket']): Socket {
  const socket = connect(server.url, { extraHeaders: headers, transports, reconnection: false, forceNew: true });
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
