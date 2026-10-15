import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrations, openDatabase, type Db } from '../src/database.js';

let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
});

afterEach(() => {
  db.close();
});

const createTask = async (title: string, projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/tasks`).send({ title, description: '' })).body;
const link = (id: number, targetId: number, kind: string) => api.post(`/api/tasks/${id}/links`).send({ targetId, kind });
const linksOf = async (id: number) =>
  ((await api.get(`/api/tasks/${id}`)).body.links as { id: number; kind: string; task: { id: number; done: boolean } }[]).map(
    (l) => [l.kind, l.task.id],
  );

describe('task links', () => {
  it('shows a link from both sides, blocked_by stored the other way round', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const c = await createTask('C');

    const res = await link(a.id, b.id, 'blocked_by');
    expect(res.status).toBe(201);
    expect(res.body.task.links).toMatchObject([{ kind: 'blocked_by', task: { id: b.id, title: 'B', columnName: 'Backlog', done: false } }]);
    expect(res.body.target.links).toMatchObject([{ kind: 'blocks', task: { id: a.id } }]);
    expect(db.prepare(`SELECT source_task_id, target_task_id, type FROM task_links`).all()).toEqual([
      { source_task_id: b.id, target_task_id: a.id, type: 'blocks' },
    ]);

    await link(c.id, a.id, 'relates');
    expect(await linksOf(a.id)).toEqual([
      ['blocked_by', b.id],
      ['relates', c.id],
    ]);
    // The board carries the links, too.
    const board = (await api.get('/api/projects/1/board')).body;
    expect(board.tasks.find((t: { id: number }) => t.id === c.id).links).toMatchObject([{ kind: 'relates', task: { id: a.id } }]);
  });

  it('marks linked tasks in the last column as done', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await link(a.id, b.id, 'blocked_by');
    const { columns, lanes } = (await api.get('/api/projects/1/board')).body;
    await api.post(`/api/tasks/${b.id}/move`).send({ columnId: columns.at(-1).id, laneId: lanes[0].id, index: 0 });
    expect((await api.get(`/api/tasks/${a.id}`)).body.links[0].task).toMatchObject({ done: true, columnName: 'Done' });
  });

  it('rejects self links, duplicates in either direction, unknown and foreign tasks', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    const p = (await api.post('/api/projects').send({ name: 'Anderes', color: 'red' })).body;
    const foreign = await createTask('X', p.id);

    expect((await link(a.id, a.id, 'relates')).status).toBe(400);
    expect((await link(a.id, b.id, 'blocks')).status).toBe(201);
    expect((await link(b.id, a.id, 'relates')).status).toBe(409);
    expect((await link(a.id, b.id, 'blocked_by')).status).toBe(409);
    expect((await link(a.id, 999, 'relates')).status).toBe(404);
    expect((await link(999, a.id, 'relates')).status).toBe(404);
    expect((await link(a.id, foreign.id, 'relates')).status).toBe(400);
    expect((await link(a.id, b.id, 'duplicates')).status).toBe(400);
  });

  it('removes links from either side and logs adding and removing', async () => {
    const a = await createTask('Design');
    const b = await createTask('Umsetzung');
    const linkId = (await link(a.id, b.id, 'blocks')).body.task.links[0].id;

    expect((await api.delete(`/api/tasks/${a.id}/links/${linkId + 1}`)).status).toBe(404);
    const res = await api.delete(`/api/tasks/${b.id}/links/${linkId}`);
    expect(res.status).toBe(200);
    expect([res.body.task.links, res.body.target.links]).toEqual([[], []]);

    const descriptions = ((await api.get('/api/projects/1/activities?type=task')).body.items as { description: string }[]).map(
      (i) => i.description,
    );
    expect(descriptions.slice(0, 2)).toEqual([
      'Verknüpfung von „Umsetzung“ mit „Design“ entfernt',
      'Task „Design“ blockiert jetzt „Umsetzung“',
    ]);
  });

  it('hides links to tasks in the trash, brings them back on restore and drops them on purge', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await link(a.id, b.id, 'relates');

    await api.delete(`/api/tasks/${b.id}`);
    expect(await linksOf(a.id)).toEqual([]);
    expect((await link(b.id, a.id, 'blocks')).status).toBe(404);

    await api.post(`/api/trash/task/${b.id}/restore`);
    expect(await linksOf(a.id)).toEqual([['relates', b.id]]);

    await api.delete(`/api/tasks/${b.id}`);
    await api.delete(`/api/trash/task/${b.id}`);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM task_links`).get()).toEqual({ n: 0 });
  });
});

describe('migration', () => {
  it('adds the empty task_links table to a version 8 database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v8.db');
    let upgraded: Db | undefined;
    try {
      const v8 = new Database(file);
      for (const sql of migrations.slice(0, 8)) v8.exec(sql);
      v8.pragma('user_version = 8');
      v8.close();

      upgraded = openDatabase(file);
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT COUNT(*) AS n FROM task_links`).get()).toEqual({ n: 0 });
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
