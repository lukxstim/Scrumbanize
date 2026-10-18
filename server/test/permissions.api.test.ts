import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';
import { createUsersRepository, type ProjectRole } from '../src/repositories/usersRepository.js';

/**
 * US-21b: every route group against every role. Each case gets a fresh database with the same fixture, so cases that
 * delete something do not affect the next one.
 */

const ROLES = ['outsider', 'viewer', 'member', 'owner'] as const;
type Who = (typeof ROLES)[number] | 'admin';
const RANK: Record<string, number> = { outsider: 0, viewer: 1, member: 2, owner: 3 };

let uploadsRoot: string;
beforeAll(() => {
  uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-perm-'));
});
afterAll(() => fs.rmSync(uploadsRoot, { recursive: true, force: true }));

interface Fixture {
  db: Db;
  app: ReturnType<typeof createApp>;
  cookie: Record<Who, string>;
  userId: Record<Who | 'newcomer' | 'extra', number>;
  ids: Record<string, number>;
}

let counter = 0;
async function fixture(): Promise<Fixture> {
  const db = openDatabase(':memory:');
  const app = createApp(db, { auth: 'required', uploadsDir: path.join(uploadsRoot, String(counter++), 'uploads') });
  const users = createUsersRepository(db);
  const now = new Date().toISOString();
  const addUser = (name: string, role: 'admin' | 'user' = 'user') =>
    (db.prepare(`INSERT INTO users (email, name, password_hash, system_role, created_at, updated_at) VALUES (?, ?, 'x', ?, ?, ?) RETURNING id`).get(
      `${name}@example.com`,
      name,
      role,
      now,
      now,
    ) as { id: number }).id;
  const userId = {
    admin: addUser('admin', 'admin'),
    owner: addUser('owner'),
    member: addUser('member'),
    viewer: addUser('viewer'),
    outsider: addUser('outsider'),
    newcomer: addUser('newcomer'),
    extra: addUser('extra'),
  };
  const cookie = Object.fromEntries(
    (['admin', 'owner', 'member', 'viewer', 'outsider'] as Who[]).map((who) => [who, `scrumbanize_session=${users.createSession(userId[who], 'test').token}`]),
  ) as Record<Who, string>;
  const roles: [number, ProjectRole][] = [
    [userId.owner, 'owner'],
    [userId.member, 'member'],
    [userId.viewer, 'viewer'],
    [userId.extra, 'member'],
  ];
  for (const [id, role] of roles) users.addMember(1, id, role);

  const as = (who: Who) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie[who]),
    post: (url: string, body?: object) => request(app).post(url).set('Cookie', cookie[who]).send(body),
    del: (url: string) => request(app).delete(url).set('Cookie', cookie[who]),
  });
  const owner = as('owner');
  const note = (await owner.post('/api/projects/1/notes', { title: 'Notiz', content: 'Inhalt', tags: [] })).body;
  const trashedNote = (await owner.post('/api/projects/1/notes', { title: 'Weg', content: '', tags: [] })).body;
  await owner.del(`/api/notes/${trashedNote.id}`);
  const task = (await owner.post('/api/projects/1/tasks', { title: 'Task', description: '' })).body;
  const other = (await owner.post('/api/projects/1/tasks', { title: 'Anderer Task', description: '' })).body;
  const label = (await owner.post('/api/projects/1/labels', { name: 'Eigenes', color: 'sky' })).body;
  const emptyColumn = (await owner.post('/api/projects/1/columns', { name: 'Leer' })).body;
  const lane = (await owner.post('/api/projects/1/lanes', { name: 'Zweite' })).body;
  const folder = (await owner.post('/api/projects/1/folders', { name: 'Ordner' })).body;
  const attachment = (await request(app).post(`/api/notes/${note.id}/attachments`).set('Cookie', cookie.owner).attach('files', Buffer.from('Hallo'), 'hallo.txt')).body[0];
  // A second project, so the first can be deleted, and a trashed one with the same members.
  const second = (await owner.post('/api/projects', { name: 'Zweites', color: 'red' })).body;
  const old = (await owner.post('/api/projects', { name: 'Altes', color: 'red' })).body;
  for (const [id, role] of roles) users.addMember(old.id, id, role);
  await owner.del(`/api/projects/${old.id}`);
  const board = (await owner.get('/api/projects/1/board')).body;
  const ids = {
    note: note.id,
    trashedNote: trashedNote.id,
    task: task.id,
    other: other.id,
    label: label.id,
    column: board.columns[0].id,
    emptyColumn: emptyColumn.id,
    lane: lane.id,
    folder: folder.id,
    attachment: attachment.id,
    second: second.id,
    old: old.id,
  };
  expect(Object.values(ids).every((v) => typeof v === 'number')).toBe(true);
  return { db, app, cookie, userId, ids };
}

type Case = {
  name: string;
  min: 'viewer' | 'member' | 'owner';
  call: (f: Fixture, cookie: string) => request.Test;
};
const get = (url: (f: Fixture) => string) => (f: Fixture, c: string) => request(f.app).get(url(f)).set('Cookie', c);
const send = (method: 'post' | 'put' | 'patch' | 'delete', url: (f: Fixture) => string, body?: (f: Fixture) => object) => (f: Fixture, c: string) =>
  request(f.app)[method](url(f)).set('Cookie', c).send(body?.(f));

const CASES: Case[] = [
  // Reading: viewer
  ...['notes', 'board', 'activities', 'analytics', 'graph', 'tags', 'labels', 'templates', 'members', 'folders'].map(
    (part): Case => ({ name: `GET /projects/:id/${part}`, min: 'viewer', call: get(() => `/api/projects/1/${part}`) }),
  ),
  { name: 'GET /notes/:id', min: 'viewer', call: get((f) => `/api/notes/${f.ids.note}`) },
  { name: 'GET /tasks/:id', min: 'viewer', call: get((f) => `/api/tasks/${f.ids.task}`) },
  { name: 'GET /labels/:id/usage', min: 'viewer', call: get((f) => `/api/labels/${f.ids.label}/usage`) },
  { name: 'GET /attachments/:id/file', min: 'viewer', call: get((f) => `/api/attachments/${f.ids.attachment}/file`) },
  { name: 'GET /notes/:id/export', min: 'viewer', call: get((f) => `/api/notes/${f.ids.note}/export?format=md`) },
  { name: 'GET /projects/:id/export/board.csv', min: 'viewer', call: get(() => '/api/projects/1/export/board.csv') },
  { name: 'GET /projects/:id/export/notes', min: 'viewer', call: get(() => '/api/projects/1/export/notes?format=md') },
  { name: 'GET /trash?project', min: 'viewer', call: get(() => '/api/trash?project=1') },
  // Changing content: member
  { name: 'POST /projects/:id/notes', min: 'member', call: send('post', () => '/api/projects/1/notes', () => ({ title: 'Neu', content: '', tags: [] })) },
  { name: 'POST /projects/:id/tasks', min: 'member', call: send('post', () => '/api/projects/1/tasks', () => ({ title: 'Neu', description: '' })) },
  { name: 'POST /projects/:id/labels', min: 'member', call: send('post', () => '/api/projects/1/labels', () => ({ name: 'Neu', color: 'red' })) },
  {
    name: 'POST /projects/:id/templates',
    min: 'member',
    call: send('post', () => '/api/projects/1/templates', () => ({ kind: 'note', scope: 'project', name: 'Neu', title: 'T', content: '', defaults: { tags: [] } })),
  },
  { name: 'POST /projects/:id/import/notes', min: 'member', call: send('post', () => '/api/projects/1/import/notes', () => ({ notes: [{ title: 'Import', content: '', tags: [] }] })) },
  { name: 'PUT /notes/:id', min: 'member', call: send('put', (f) => `/api/notes/${f.ids.note}`, () => ({ title: 'Neu', content: '', tags: [] })) },
  { name: 'DELETE /notes/:id', min: 'member', call: send('delete', (f) => `/api/notes/${f.ids.note}`) },
  { name: 'PATCH /tasks/:id', min: 'member', call: send('patch', (f) => `/api/tasks/${f.ids.task}`, () => ({ title: 'Neu' })) },
  { name: 'POST /tasks/:id/move', min: 'member', call: send('post', (f) => `/api/tasks/${f.ids.task}/move`, (f) => ({ columnId: f.ids.column, laneId: f.ids.lane, index: 0 })) },
  { name: 'POST /tasks/:id/links', min: 'member', call: send('post', (f) => `/api/tasks/${f.ids.task}/links`, (f) => ({ targetId: f.ids.other, kind: 'relates' })) },
  { name: 'DELETE /tasks/:id', min: 'member', call: send('delete', (f) => `/api/tasks/${f.ids.task}`) },
  { name: 'PATCH /labels/:id', min: 'member', call: send('patch', (f) => `/api/labels/${f.ids.label}`, () => ({ name: 'Anders' })) },
  { name: 'POST /labels/:id/move', min: 'member', call: send('post', (f) => `/api/labels/${f.ids.label}/move`, () => ({ index: 0 })) },
  { name: 'DELETE /labels/:id', min: 'member', call: send('delete', (f) => `/api/labels/${f.ids.label}`) },
  {
    name: 'POST /notes/:id/attachments',
    min: 'member',
    call: (f, c) => request(f.app).post(`/api/notes/${f.ids.note}/attachments`).set('Cookie', c).attach('files', Buffer.from('x'), 'x.txt'),
  },
  { name: 'POST /projects/:id/folders', min: 'member', call: send('post', () => '/api/projects/1/folders', () => ({ name: 'Neu' })) },
  { name: 'PATCH /folders/:id', min: 'member', call: send('patch', (f) => `/api/folders/${f.ids.folder}`, () => ({ name: 'Anders' })) },
  { name: 'DELETE /folders/:id', min: 'member', call: send('delete', (f) => `/api/folders/${f.ids.folder}`) },
  { name: 'PUT /notes/:id/folder', min: 'member', call: send('put', (f) => `/api/notes/${f.ids.note}/folder`, (f) => ({ folderId: f.ids.folder })) },
  { name: 'DELETE /attachments/:id', min: 'member', call: send('delete', (f) => `/api/attachments/${f.ids.attachment}`) },
  { name: 'POST /trash/note/:id/restore', min: 'member', call: send('post', (f) => `/api/trash/note/${f.ids.trashedNote}/restore`) },
  // Board structure, project and deleting for good: owner
  { name: 'POST /projects/:id/columns', min: 'owner', call: send('post', () => '/api/projects/1/columns', () => ({ name: 'Neu' })) },
  { name: 'PUT /projects/:id/column-widths', min: 'owner', call: send('put', () => '/api/projects/1/column-widths', (f) => ({ widths: [{ id: f.ids.column, width: 300 }] })) },
  { name: 'POST /projects/:id/lanes', min: 'owner', call: send('post', () => '/api/projects/1/lanes', () => ({ name: 'Neu' })) },
  { name: 'PATCH /columns/:id (WIP)', min: 'owner', call: send('patch', (f) => `/api/columns/${f.ids.column}`, () => ({ wipLimit: 2 })) },
  { name: 'PATCH /columns/:id (width)', min: 'owner', call: send('patch', (f) => `/api/columns/${f.ids.column}`, () => ({ width: 320 })) },
  { name: 'POST /columns/:id/move', min: 'owner', call: send('post', (f) => `/api/columns/${f.ids.column}/move`, () => ({ index: 1 })) },
  { name: 'DELETE /columns/:id', min: 'owner', call: send('delete', (f) => `/api/columns/${f.ids.emptyColumn}`) },
  { name: 'PATCH /lanes/:id', min: 'owner', call: send('patch', (f) => `/api/lanes/${f.ids.lane}`, () => ({ name: 'Umbenannt' })) },
  { name: 'DELETE /lanes/:id', min: 'owner', call: send('delete', (f) => `/api/lanes/${f.ids.lane}`) },
  { name: 'PATCH /projects/:id', min: 'owner', call: send('patch', () => '/api/projects/1', () => ({ name: 'Umbenannt' })) },
  { name: 'DELETE /projects/:id', min: 'owner', call: send('delete', () => '/api/projects/1') },
  { name: 'DELETE /trash/note/:id', min: 'owner', call: send('delete', (f) => `/api/trash/note/${f.ids.trashedNote}`) },
  { name: 'DELETE /trash?project', min: 'owner', call: send('delete', () => '/api/trash?project=1') },
  { name: 'POST /trash/project/:id/restore', min: 'owner', call: send('post', (f) => `/api/trash/project/${f.ids.old}/restore`) },
  { name: 'POST /projects/:id/members', min: 'owner', call: send('post', () => '/api/projects/1/members', () => ({ email: 'newcomer@example.com', role: 'viewer' })) },
  { name: 'PATCH /projects/:id/members/:user', min: 'owner', call: send('patch', (f) => `/api/projects/1/members/${f.userId.extra}`, () => ({ role: 'viewer' })) },
  { name: 'DELETE /projects/:id/members/:user', min: 'owner', call: send('delete', (f) => `/api/projects/1/members/${f.userId.extra}`) },
];

describe('permission matrix', () => {
  for (const testCase of CASES) {
    it(`${testCase.name}: ${testCase.min} and above`, async () => {
      const results: Record<string, number> = {};
      const expected: Record<string, number | 'ok'> = {};
      for (const who of [...ROLES, 'admin'] as const) {
        const f = await fixture();
        const res = await testCase.call(f, f.cookie[who]);
        results[who] = res.status;
        // A system administrator without membership sees nothing of the project, like an outsider.
        const rank = who === 'admin' ? 0 : RANK[who]!;
        expected[who] = rank >= RANK[testCase.min]! ? 'ok' : rank === 0 ? 404 : 403;
        f.db.close();
      }
      const actual = Object.fromEntries(Object.entries(results).map(([who, status]) => [who, status < 400 ? 'ok' : status]));
      expect(actual).toEqual(expected);
    });
  }
});

describe('what each user sees', () => {
  it('lists only their own projects, each with their role', async () => {
    const f = await fixture();
    const list = async (who: Who) => ((await request(f.app).get('/api/projects').set('Cookie', f.cookie[who])).body as { name: string; role: string }[]).map((p) => `${p.name}:${p.role}`);
    expect(await list('owner')).toEqual(['Allgemein:owner', 'Zweites:owner']);
    expect(await list('viewer')).toEqual(['Allgemein:viewer']);
    expect(await list('outsider')).toEqual([]);
    expect(await list('admin')).toEqual([]);
  });

  it('searches, shows the trash and reminds only within their projects', async () => {
    const f = await fixture();
    const outsiderProject = (await request(f.app).post('/api/projects').set('Cookie', f.cookie.outsider).send({ name: 'Privat', color: 'pink' })).body;
    await request(f.app).post(`/api/projects/${outsiderProject.id}/tasks`).set('Cookie', f.cookie.outsider).send({ title: 'Geheimer Task', description: '', dueDate: '2026-01-01' });
    await request(f.app).post(`/api/projects/1/tasks`).set('Cookie', f.cookie.owner).send({ title: 'Geheimer Plan', description: '', dueDate: '2026-01-01' });

    const search = async (who: Who) => ((await request(f.app).get('/api/search?q=Geheim').set('Cookie', f.cookie[who])).body.tasks as { title: string }[]).map((t) => t.title);
    expect(await search('viewer')).toEqual(['Geheimer Plan']);
    expect(await search('outsider')).toEqual(['Geheimer Task']);

    const due = async (who: Who) => ((await request(f.app).get('/api/reminders/due?date=2026-12-31').set('Cookie', f.cookie[who])).body as { title: string }[]).map((t) => t.title);
    expect(await due('member')).toEqual(['Geheimer Plan']);
    expect(await due('outsider')).toEqual(['Geheimer Task']);

    const trash = async (who: Who) => ((await request(f.app).get('/api/trash').set('Cookie', f.cookie[who])).body as { title: string }[]).map((i) => i.title);
    expect(await trash('viewer')).toEqual(expect.arrayContaining(['Weg', 'Altes']));
    expect(await trash('outsider')).toEqual([]);
  });

  it('empties only the trash of projects the user owns', async () => {
    const f = await fixture();
    const outsiderProject = (await request(f.app).post('/api/projects').set('Cookie', f.cookie.outsider).send({ name: 'Privat', color: 'pink' })).body;
    const own = (await request(f.app).post(`/api/projects/${outsiderProject.id}/notes`).set('Cookie', f.cookie.outsider).send({ title: 'Eigene', content: '', tags: [] })).body;
    await request(f.app).delete(`/api/notes/${own.id}`).set('Cookie', f.cookie.outsider);

    const emptied = await request(f.app).delete('/api/trash').set('Cookie', f.cookie.outsider);
    expect(emptied.body).toEqual({ notes: 1, tasks: 0, projects: 0 });
    // The owner's trash is untouched.
    const left = (await request(f.app).get('/api/trash').set('Cookie', f.cookie.owner)).body as { title: string }[];
    expect(left.map((i) => i.title)).toEqual(expect.arrayContaining(['Weg', 'Altes']));
  });
});

describe('administrators', () => {
  it('make backups, nobody else', async () => {
    for (const who of ['admin', 'owner', 'member'] as const) {
      const f = await fixture();
      const res = await request(f.app).get('/api/backup').set('Cookie', f.cookie[who]).buffer(true).parse((stream, done) => {
        stream.on('data', () => {});
        stream.on('end', () => done(null, null));
      });
      expect(res.status, who).toBe(who === 'admin' ? 200 : 403);
      expect((await request(f.app).post('/api/backup/restore').set('Cookie', f.cookie[who])).status, who).toBe(who === 'admin' ? 400 : 403);
      f.db.close();
    }
  });

  it('alone change templates for all projects', async () => {
    const f = await fixture();
    const template = { kind: 'note', scope: 'global', name: 'Für alle', title: 'T', content: '', defaults: { tags: [] } };
    expect((await request(f.app).post('/api/projects/1/templates').set('Cookie', f.cookie.owner).send(template)).status).toBe(403);
    const global = (await request(f.app).get('/api/projects/1/templates').set('Cookie', f.cookie.owner)).body.find((t: { scope: string }) => t.scope === 'global');
    expect((await request(f.app).patch(`/api/projects/1/templates/${global.id}`).set('Cookie', f.cookie.owner).send({ name: 'X' })).status).toBe(403);
    expect((await request(f.app).delete(`/api/projects/1/templates/${global.id}`).set('Cookie', f.cookie.owner)).status).toBe(403);
    // Moving a project template to all projects counts as changing those.
    const own = (await request(f.app).post('/api/projects/1/templates').set('Cookie', f.cookie.member).send({ ...template, scope: 'project', name: 'Eigene' })).body;
    expect((await request(f.app).patch(`/api/projects/1/templates/${own.id}`).set('Cookie', f.cookie.member).send({ scope: 'global' })).status).toBe(403);

    // An administrator who is a member of the project may.
    createUsersRepository(f.db).addMember(1, f.userId.admin, 'member');
    expect((await request(f.app).post('/api/projects/1/templates').set('Cookie', f.cookie.admin).send(template)).status).toBe(201);
  });
});

describe('members', () => {
  const members = async (f: Fixture) =>
    ((await request(f.app).get('/api/projects/1/members').set('Cookie', f.cookie.viewer)).body as { user: { name: string }; role: string }[]).map(
      (m) => `${m.user.name}:${m.role}`,
    );

  it('are listed owners first, and added by the email of an existing account', async () => {
    const f = await fixture();
    expect(await members(f)).toEqual(['owner:owner', 'extra:member', 'member:member', 'viewer:viewer']);
    const add = (email: string) => request(f.app).post('/api/projects/1/members').set('Cookie', f.cookie.owner).send({ email, role: 'member' });
    expect((await add('niemand@example.com')).body.error.code).toBe('user_not_found');
    expect((await add('MEMBER@example.com')).body.error.code).toBe('already_member');
    const added = await add('newcomer@example.com');
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ user: { name: 'newcomer', email: 'newcomer@example.com' }, role: 'member' });
    expect(added.body.user).not.toHaveProperty('passwordHash');
    // The newcomer sees the project now.
    const session = createUsersRepository(f.db).createSession(f.userId.newcomer, 't').token;
    expect((await request(f.app).get('/api/projects/1/board').set('Cookie', `scrumbanize_session=${session}`)).status).toBe(200);
  });

  it('always keep an owner', async () => {
    const f = await fixture();
    const ownerId = f.userId.owner;
    const patch = (role: string) => request(f.app).patch(`/api/projects/1/members/${ownerId}`).set('Cookie', f.cookie.owner).send({ role });
    expect((await patch('member')).body.error.code).toBe('last_owner');
    expect((await request(f.app).delete(`/api/projects/1/members/${ownerId}`).set('Cookie', f.cookie.owner)).body.error.code).toBe('last_owner');

    // With a second owner, the first may step down.
    await request(f.app).patch(`/api/projects/1/members/${f.userId.member}`).set('Cookie', f.cookie.owner).send({ role: 'owner' });
    expect((await patch('viewer')).status).toBe(200);
    expect(await members(f)).toEqual(['member:owner', 'extra:member', 'owner:viewer', 'viewer:viewer']);
  });

  it('may leave a project themselves, and then no longer see it', async () => {
    const f = await fixture();
    const left = await request(f.app).delete(`/api/projects/1/members/${f.userId.viewer}`).set('Cookie', f.cookie.viewer);
    expect(left.status).toBe(204);
    expect((await request(f.app).get('/api/projects/1/board').set('Cookie', f.cookie.viewer)).status).toBe(404);
    // A viewer cannot remove anybody else.
    expect((await request(f.app).delete(`/api/projects/1/members/${f.userId.extra}`).set('Cookie', f.cookie.member)).status).toBe(403);
  });

  it('changes are logged with their author', async () => {
    const f = await fixture();
    await request(f.app).post('/api/projects/1/members').set('Cookie', f.cookie.owner).send({ email: 'newcomer@example.com', role: 'viewer' });
    await request(f.app).delete(`/api/projects/1/members/${f.userId.viewer}`).set('Cookie', f.cookie.viewer);
    const items = (await request(f.app).get('/api/projects/1/activities?type=project').set('Cookie', f.cookie.owner)).body.items as {
      description: string;
      author: { name: string } | null;
    }[];
    expect(items.slice(0, 2).map((i) => [i.description, i.author?.name])).toEqual([
      ['viewer hat das Projekt verlassen', 'viewer'],
      ['newcomer als Betrachter hinzugefügt', 'owner'],
    ]);
  });
});

describe('activity authors', () => {
  it('name who did something, and keep edits of different people apart', async () => {
    const f = await fixture();
    const task = f.ids.task;
    await request(f.app).patch(`/api/tasks/${task}`).set('Cookie', f.cookie.member).send({ title: 'Von Member' });
    await request(f.app).patch(`/api/tasks/${task}`).set('Cookie', f.cookie.owner).send({ description: 'Vom Owner' });
    const items = (await request(f.app).get('/api/projects/1/activities?type=task').set('Cookie', f.cookie.viewer)).body.items as {
      entityId: number;
      actionType: string;
      author: { name: string } | null;
    }[];
    const forTask = items.filter((i) => i.entityId === task).map((i) => `${i.actionType}:${i.author?.name}`);
    // Created by the owner (fixture); the member's edit and the owner's later edit are separate entries.
    expect(forTask).toEqual(['update:owner', 'update:member', 'create:owner']);
  });
});
