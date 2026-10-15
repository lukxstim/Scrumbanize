import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
});

afterEach(() => {
  db.close();
});

async function createTasks(...titles: string[]): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const title of titles) {
    ids[title] = (await api.post('/api/projects/1/tasks').send({ title, description: '' })).body.id;
  }
  return ids;
}

async function move(id: number, status: string, index: number) {
  const res = await api.post(`/api/tasks/${id}/move`).send({ status, index });
  expect(res.status).toBe(200);
  return res.body;
}

/** Task titles per column, in board order. */
async function columns(): Promise<Record<string, string[]>> {
  const { tasks } = (await api.get('/api/projects/1/board')).body;
  const result: Record<string, string[]> = {};
  for (const task of tasks) (result[task.status] ??= []).push(task.title);
  return result;
}

describe('GET /api/projects/:id/board', () => {
  it('returns all five columns with default WIP limits, and the tasks', async () => {
    await createTasks('A');
    const board = (await api.get('/api/projects/1/board')).body;

    expect(board.columns).toEqual([
      { status: 'backlog', wipLimit: null },
      { status: 'todo', wipLimit: null },
      { status: 'in_progress', wipLimit: 3 },
      { status: 'review', wipLimit: null },
      { status: 'done', wipLimit: null },
    ]);
    expect(board.tasks.map((t: { title: string }) => t.title)).toEqual(['A']);
  });
});

describe('moving tasks', () => {
  it('moves a task to another column', async () => {
    const { A } = await createTasks('A', 'B');
    const moved = await move(A!, 'in_progress', 0);

    expect(moved).toMatchObject({ id: A, status: 'in_progress' });
    expect(await columns()).toEqual({ backlog: ['B'], in_progress: ['A'] });
  });

  it('reorders within a column: to the start, the middle and the end', async () => {
    const { A, B, C, D } = await createTasks('A', 'B', 'C', 'D');

    await move(D!, 'backlog', 0);
    expect((await columns()).backlog).toEqual(['D', 'A', 'B', 'C']);

    await move(D!, 'backlog', 2);
    expect((await columns()).backlog).toEqual(['A', 'B', 'D', 'C']);

    await move(A!, 'backlog', 3);
    expect((await columns()).backlog).toEqual(['B', 'D', 'C', 'A']);

    // An index past the end is clamped.
    await move(B!, 'backlog', 99);
    expect((await columns()).backlog).toEqual(['D', 'C', 'A', 'B']);
    expect(C).toBeDefined();
  });

  it('inserts at a position in another column', async () => {
    const { A, B, C } = await createTasks('A', 'B', 'C');
    await move(A!, 'todo', 0);
    await move(B!, 'todo', 1);
    await move(C!, 'todo', 1);
    expect((await columns()).todo).toEqual(['A', 'C', 'B']);
  });

  it('keeps the order correct after many moves into the same gap', async () => {
    const titles = Array.from({ length: 40 }, (_, i) => `T${i}`);
    const ids = await createTasks('first', 'last', ...titles);

    // Each task is inserted directly after "first", halving the same gap until the column is renumbered.
    for (const title of titles) await move(ids[title]!, 'backlog', 1);

    expect((await columns()).backlog).toEqual(['first', ...[...titles].reverse(), 'last']);
  });

  it('survives a restart of the board query (positions are stored)', async () => {
    const { A, B } = await createTasks('A', 'B');
    await move(B!, 'backlog', 0);
    const fresh = request(createApp(db));
    const tasks = (await fresh.get('/api/projects/1/board')).body.tasks;
    expect(tasks.map((t: { id: number }) => t.id)).toEqual([B, A]);
  });

  it('rejects invalid moves', async () => {
    const { A } = await createTasks('A');
    expect((await api.post(`/api/tasks/${A}/move`).send({ status: 'blocked', index: 0 })).status).toBe(400);
    expect((await api.post(`/api/tasks/${A}/move`).send({ status: 'todo', index: -1 })).status).toBe(400);
    expect((await api.post(`/api/tasks/${A}/move`).send({ status: 'todo', index: 1.5 })).status).toBe(400);
    expect((await api.post('/api/tasks/999/move').send({ status: 'todo', index: 0 })).status).toBe(404);
  });

  it('shows the new status on the source note', async () => {
    const note = (await api.post('/api/projects/1/notes').send({ title: 'N', content: '', tags: [] })).body;
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'A', description: '', sourceNoteId: note.id })).body;
    await move(task.id, 'review', 0);
    expect((await api.get(`/api/notes/${note.id}`)).body.tasks[0].status).toBe('review');
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('updates title and description independently', async () => {
    const { A } = await createTasks('A');

    expect((await api.patch(`/api/tasks/${A}`).send({ title: ' Renamed ' })).body).toMatchObject({ title: 'Renamed', description: '' });
    expect((await api.patch(`/api/tasks/${A}`).send({ description: 'Details' })).body).toMatchObject({
      title: 'Renamed',
      description: 'Details',
    });
  });

  it('rejects an empty title and unknown tasks', async () => {
    const { A } = await createTasks('A');
    expect((await api.patch(`/api/tasks/${A}`).send({ title: '' })).status).toBe(400);
    expect((await api.patch('/api/tasks/999').send({ title: 'x' })).status).toBe(404);
  });
});

describe('WIP limits', () => {
  it('sets and clears the limit of an active column', async () => {
    expect((await api.patch('/api/projects/1/board/columns/review').send({ wipLimit: 2 })).body).toEqual({ status: 'review', wipLimit: 2 });
    expect((await api.patch('/api/projects/1/board/columns/in_progress').send({ wipLimit: null })).body).toEqual({
      status: 'in_progress',
      wipLimit: null,
    });

    const { columns } = (await api.get('/api/projects/1/board')).body;
    expect(columns.find((c: { status: string }) => c.status === 'review').wipLimit).toBe(2);
    expect(columns.find((c: { status: string }) => c.status === 'in_progress').wipLimit).toBeNull();
  });

  it('does not allow limits on Backlog and Done, or invalid values', async () => {
    expect((await api.patch('/api/projects/1/board/columns/backlog').send({ wipLimit: 2 })).status).toBe(400);
    expect((await api.patch('/api/projects/1/board/columns/done').send({ wipLimit: 2 })).status).toBe(400);
    expect((await api.patch('/api/projects/1/board/columns/todo').send({ wipLimit: 0 })).status).toBe(400);
    expect((await api.patch('/api/projects/1/board/columns/todo').send({})).status).toBe(400);
  });

  it('does not block moves into a full column', async () => {
    const { A, B } = await createTasks('A', 'B');
    await api.patch('/api/projects/1/board/columns/todo').send({ wipLimit: 1 });
    await move(A!, 'todo', 0);
    await move(B!, 'todo', 1);
    expect((await columns()).todo).toEqual(['A', 'B']);
  });
});
