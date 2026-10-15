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

interface Board {
  columns: { id: number; name: string; position: number; wipLimit: number | null }[];
  lanes: { id: number; name: string; position: number }[];
  tasks: { id: number; title: string; columnId: number; laneId: number }[];
}

const board = async (projectId = 1): Promise<Board> => (await api.get(`/api/projects/${projectId}/board`)).body;
const columnId = async (name: string, projectId = 1) => (await board(projectId)).columns.find((c) => c.name === name)!.id;

async function createTasks(...titles: string[]): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const title of titles) {
    ids[title] = (await api.post('/api/projects/1/tasks').send({ title, description: '' })).body.id;
  }
  return ids;
}

async function move(id: number, column: string, index: number, laneId?: number) {
  const b = await board();
  const res = await api
    .post(`/api/tasks/${id}/move`)
    .send({ columnId: b.columns.find((c) => c.name === column)!.id, laneId: laneId ?? b.lanes[0]!.id, index });
  expect(res.status).toBe(200);
  return res.body;
}

/** Task titles per column (and lane, when there are several), in board order. */
async function layout(projectId = 1): Promise<Record<string, string[]>> {
  const b = await board(projectId);
  const result: Record<string, string[]> = {};
  for (const task of b.tasks) {
    const column = b.columns.find((c) => c.id === task.columnId)!.name;
    const key = b.lanes.length > 1 ? `${column}/${b.lanes.find((l) => l.id === task.laneId)!.name}` : column;
    (result[key] ??= []).push(task.title);
  }
  return result;
}

describe('GET /api/projects/:id/board', () => {
  it('starts with the five standard columns and one lane', async () => {
    await createTasks('A');
    const b = await board();

    expect(b.columns.map((c) => [c.name, c.wipLimit])).toEqual([
      ['Backlog', null],
      ['To Do', null],
      ['In Progress', 3],
      ['Review', null],
      ['Done', null],
    ]);
    expect(b.lanes.map((l) => l.name)).toEqual(['Standard']);
    expect(b.tasks).toEqual([expect.objectContaining({ title: 'A', columnId: b.columns[0]!.id, laneId: b.lanes[0]!.id })]);
  });
});

describe('moving tasks', () => {
  it('moves a task to another column', async () => {
    const { A } = await createTasks('A', 'B');
    await move(A!, 'In Progress', 0);
    expect(await layout()).toEqual({ Backlog: ['B'], 'In Progress': ['A'] });
  });

  it('reorders within a column: to the start, the middle and the end', async () => {
    const { A, B, D } = await createTasks('A', 'B', 'C', 'D');

    await move(D!, 'Backlog', 0);
    expect((await layout()).Backlog).toEqual(['D', 'A', 'B', 'C']);
    await move(D!, 'Backlog', 2);
    expect((await layout()).Backlog).toEqual(['A', 'B', 'D', 'C']);
    await move(A!, 'Backlog', 3);
    expect((await layout()).Backlog).toEqual(['B', 'D', 'C', 'A']);
    await move(B!, 'Backlog', 99); // clamped to the end
    expect((await layout()).Backlog).toEqual(['D', 'C', 'A', 'B']);
  });

  it('keeps the order correct after many moves into the same gap', async () => {
    const titles = Array.from({ length: 40 }, (_, i) => `T${i}`);
    const ids = await createTasks('first', 'last', ...titles);
    for (const title of titles) await move(ids[title]!, 'Backlog', 1);
    expect((await layout()).Backlog).toEqual(['first', ...[...titles].reverse(), 'last']);
  });

  it('moves between lanes', async () => {
    const { A, B } = await createTasks('A', 'B');
    const bugs = (await api.post('/api/projects/1/lanes').send({ name: 'Bugs' })).body;

    await move(A!, 'To Do', 0, bugs.id);
    await move(B!, 'To Do', 0);
    expect(await layout()).toEqual({ 'To Do/Standard': ['B'], 'To Do/Bugs': ['A'] });
  });

  it('rejects invalid moves and columns or lanes of another project', async () => {
    const { A } = await createTasks('A');
    const other = (await api.post('/api/projects').send({ name: 'Privat', color: 'red' })).body;
    const otherBoard = await board(other.id);
    const own = await board();

    const send = (body: object) => api.post(`/api/tasks/${A}/move`).send(body);
    expect((await send({ columnId: own.columns[0]!.id, laneId: own.lanes[0]!.id, index: -1 })).status).toBe(400);
    expect((await send({ status: 'todo', index: 0 })).status).toBe(400);
    expect((await send({ columnId: otherBoard.columns[1]!.id, laneId: own.lanes[0]!.id, index: 0 })).status).toBe(400);
    expect((await send({ columnId: own.columns[1]!.id, laneId: otherBoard.lanes[0]!.id, index: 0 })).status).toBe(400);
    expect((await api.post('/api/tasks/999/move').send({ columnId: own.columns[0]!.id, laneId: own.lanes[0]!.id, index: 0 })).status).toBe(404);
  });

  it('shows the column name on the source note', async () => {
    const note = (await api.post('/api/projects/1/notes').send({ title: 'N', content: '', tags: [] })).body;
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'A', description: '', sourceNoteId: note.id })).body;
    await move(task.id, 'Review', 0);
    expect((await api.get(`/api/notes/${note.id}`)).body.tasks[0]).toEqual({
      id: task.id,
      title: 'A',
      column: { id: await columnId('Review'), name: 'Review' },
    });
  });
});

describe('creating tasks', () => {
  it('puts new tasks into the first column, also after reordering columns', async () => {
    const done = await columnId('Done');
    await api.post(`/api/columns/${done}/move`).send({ index: 0 });
    await createTasks('A');
    expect(await layout()).toEqual({ Done: ['A'] });
  });

  it('uses the given lane, which must belong to the project', async () => {
    const bugs = (await api.post('/api/projects/1/lanes').send({ name: 'Bugs' })).body;
    const res = await api.post('/api/projects/1/tasks').send({ title: 'A', description: '', laneId: bugs.id });
    expect(res.body.laneId).toBe(bugs.id);

    const other = (await api.post('/api/projects').send({ name: 'Privat', color: 'red' })).body;
    const otherLane = (await board(other.id)).lanes[0]!.id;
    expect((await api.post('/api/projects/1/tasks').send({ title: 'B', description: '', laneId: otherLane })).status).toBe(400);
  });
});

describe('columns', () => {
  it('adds, renames and sets WIP limits on any column', async () => {
    const res = await api.post('/api/projects/1/columns').send({ name: '  Testing ', wipLimit: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Testing', wipLimit: 2 });
    expect((await board()).columns.at(-1)!.name).toBe('Testing');

    const backlog = await columnId('Backlog');
    expect((await api.patch(`/api/columns/${backlog}`).send({ name: 'Ideen', wipLimit: 10 })).body).toMatchObject({
      name: 'Ideen',
      wipLimit: 10,
    });
    expect((await api.patch(`/api/columns/${backlog}`).send({ wipLimit: null })).body).toMatchObject({ wipLimit: null });
  });

  it('validates names and limits', async () => {
    const todo = await columnId('To Do');
    expect((await api.post('/api/projects/1/columns').send({ name: 'review' })).status).toBe(409);
    expect((await api.patch(`/api/columns/${todo}`).send({ name: 'DONE' })).status).toBe(409);
    expect((await api.patch(`/api/columns/${todo}`).send({ name: 'to do' })).status).toBe(200); // own name, other case
    expect((await api.post('/api/projects/1/columns').send({ name: 'x'.repeat(41) })).status).toBe(400);
    expect((await api.post('/api/projects/1/columns').send({ name: ' ' })).status).toBe(400);
    expect((await api.patch(`/api/columns/${todo}`).send({ wipLimit: 0 })).status).toBe(400);
    expect((await api.patch('/api/columns/999').send({ name: 'x' })).status).toBe(404);
  });

  it('allows at most 20 columns per project', async () => {
    for (let i = 0; i < 15; i++) {
      expect((await api.post('/api/projects/1/columns').send({ name: `C${i}` })).status).toBe(201);
    }
    expect((await api.post('/api/projects/1/columns').send({ name: 'C99' })).status).toBe(409);
  });

  it('reorders columns', async () => {
    const done = await columnId('Done');
    await api.post(`/api/columns/${done}/move`).send({ index: 1 });
    expect((await board()).columns.map((c) => c.name)).toEqual(['Backlog', 'Done', 'To Do', 'In Progress', 'Review']);
  });

  it('deletes empty columns, and moves tasks of non-empty ones to the chosen column', async () => {
    const { A, B, C } = await createTasks('A', 'B', 'C');
    await move(A!, 'Review', 0);
    await move(B!, 'Review', 1);
    await move(C!, 'Done', 0);

    expect((await api.delete(`/api/columns/${await columnId('To Do')}`)).status).toBe(204);

    const review = await columnId('Review');
    expect((await api.delete(`/api/columns/${review}`)).status).toBe(409);
    expect((await api.delete(`/api/columns/${review}?moveTasksTo=${review}`)).status).toBe(400);
    expect((await api.delete(`/api/columns/${review}?moveTasksTo=${await columnId('Done')}`)).status).toBe(204);

    // Moved tasks go after the target's tasks, keeping their order.
    expect(await layout()).toEqual({ Done: ['C', 'A', 'B'] });
    expect((await board()).columns.map((c) => c.name)).toEqual(['Backlog', 'In Progress', 'Done']);
  });

  it('keeps the last column', async () => {
    const b = await board();
    for (const column of b.columns.slice(1)) await api.delete(`/api/columns/${column.id}`);
    expect((await api.delete(`/api/columns/${b.columns[0]!.id}`)).status).toBe(409);
  });

  it('does not block moves into a column over its WIP limit', async () => {
    const { A, B } = await createTasks('A', 'B');
    await api.patch(`/api/columns/${await columnId('To Do')}`).send({ wipLimit: 1 });
    await move(A!, 'To Do', 0);
    await move(B!, 'To Do', 1);
    expect((await layout())['To Do']).toEqual(['A', 'B']);
  });
});

describe('lanes', () => {
  it('adds, renames, reorders and deletes lanes, moving their tasks', async () => {
    const bugs = (await api.post('/api/projects/1/lanes').send({ name: 'Bugs' })).body;
    const expedite = (await api.post('/api/projects/1/lanes').send({ name: 'Expedite' })).body;
    expect((await api.post('/api/projects/1/lanes').send({ name: 'bugs' })).status).toBe(409);

    await api.patch(`/api/lanes/${bugs.id}`).send({ name: 'Fehler' });
    await api.post(`/api/lanes/${expedite.id}/move`).send({ index: 0 });
    expect((await board()).lanes.map((l) => l.name)).toEqual(['Expedite', 'Standard', 'Fehler']);

    const task = (await api.post('/api/projects/1/tasks').send({ title: 'A', description: '', laneId: bugs.id })).body;
    expect((await api.delete(`/api/lanes/${bugs.id}`)).status).toBe(409);
    expect((await api.delete(`/api/lanes/${bugs.id}?moveTasksTo=${expedite.id}`)).status).toBe(204);
    expect((await api.get(`/api/tasks/${task.id}`)).body.laneId).toBe(expedite.id);
  });

  it('keeps the last lane', async () => {
    const lane = (await board()).lanes[0]!;
    expect((await api.delete(`/api/lanes/${lane.id}`)).status).toBe(409);
  });
});

describe('migration to custom columns', () => {
  it('turns statuses of a version 4 database into columns and puts tasks into the lane "Standard"', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v4.db');
    let upgraded: Db | undefined;
    try {
      const v4 = new Database(file);
      for (const sql of migrations.slice(0, 4)) v4.exec(sql);
      v4.pragma('user_version = 4');
      v4.exec(`
        INSERT INTO projects (id, name, color, created_at, updated_at) VALUES (2, 'Privat', 'red', 'c', 'u');
        INSERT INTO board_columns (project_id, status, wip_limit) VALUES
          (2, 'backlog', NULL), (2, 'todo', 7), (2, 'in_progress', 3), (2, 'review', NULL), (2, 'done', NULL);
        UPDATE board_columns SET wip_limit = 4 WHERE project_id = 1 AND status = 'review';
        INSERT INTO notes (id, project_id, title, content, created_at, updated_at) VALUES (9, 1, 'N', '', 'c', 'u');
        INSERT INTO tasks (id, project_id, title, description, status, position, source_note_id, created_at, updated_at) VALUES
          (1, 1, 'Review A', '', 'review', 1, 9, 'c', 'u'),
          (2, 1, 'Review B', '', 'review', 2, NULL, 'c', 'u'),
          (3, 1, 'Fertig', '', 'done', 1, NULL, 'c', 'u'),
          (4, 2, 'Privat todo', '', 'todo', 5, NULL, 'c', 'u');
      `);
      v4.close();

      upgraded = openDatabase(file);
      api = request(createApp(upgraded));

      const b1 = await board(1);
      expect(b1.columns.map((c) => [c.name, c.wipLimit])).toEqual([
        ['Backlog', null],
        ['To Do', null],
        ['In Progress', 3],
        ['Review', 4],
        ['Done', null],
      ]);
      expect(b1.lanes.map((l) => l.name)).toEqual(['Standard']);
      expect(await layout(1)).toEqual({ Review: ['Review A', 'Review B'], Done: ['Fertig'] });
      expect(await layout(2)).toEqual({ 'To Do': ['Privat todo'] });
      expect((await board(2)).columns[1]).toMatchObject({ name: 'To Do', wipLimit: 7 });
      expect((await api.get('/api/notes/9')).body.tasks).toEqual([
        { id: 1, title: 'Review A', column: { id: b1.columns[3]!.id, name: 'Review' } },
      ]);
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
