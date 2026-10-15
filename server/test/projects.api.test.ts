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

async function createProject(name: string, color = 'indigo') {
  const res = await api.post('/api/projects').send({ name, color });
  expect(res.status).toBe(201);
  return res.body;
}

async function createNote(projectId: number, title: string, tags: string[] = []) {
  return (await api.post(`/api/projects/${projectId}/notes`).send({ title, content: '', tags })).body;
}

async function createTask(projectId: number, title: string, sourceNoteId?: number) {
  return api.post(`/api/projects/${projectId}/tasks`).send({ title, description: '', sourceNoteId });
}

describe('projects', () => {
  it('starts with the default project "Allgemein"', async () => {
    expect((await api.get('/api/projects')).body).toEqual([
      expect.objectContaining({ id: 1, name: 'Allgemein', color: 'slate', noteCount: 0, taskCount: 0 }),
    ]);
  });

  it('creates projects and lists them alphabetically with counts', async () => {
    const studium = await createProject('Studium', 'emerald');
    await createProject('alpha');
    await createNote(studium.id, 'Vorlesung');
    await createTask(studium.id, 'Hausarbeit');

    const list = (await api.get('/api/projects')).body;
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Allgemein', 'alpha', 'Studium']);
    expect(list[2]).toMatchObject({ name: 'Studium', color: 'emerald', noteCount: 1, taskCount: 1 });
  });

  it('gives new projects the default WIP limits', async () => {
    const project = await createProject('Neu');
    const { columns } = (await api.get(`/api/projects/${project.id}/board`)).body;
    expect(columns.find((c: { name: string }) => c.name === 'In Progress').wipLimit).toBe(3);
  });

  it('rejects duplicate names regardless of case, including umlauts', async () => {
    await createProject('Ärger');
    expect((await api.post('/api/projects').send({ name: 'ärger', color: 'red' })).status).toBe(409);
    expect((await api.post('/api/projects').send({ name: 'ALLGEMEIN', color: 'red' })).status).toBe(409);
  });

  it('renames and recolors, allowing a case change of its own name', async () => {
    const project = await createProject('privat');
    expect((await api.patch(`/api/projects/${project.id}`).send({ name: 'Privat' })).body).toMatchObject({ name: 'Privat' });
    expect((await api.patch(`/api/projects/${project.id}`).send({ color: 'pink' })).body).toMatchObject({
      name: 'Privat',
      color: 'pink',
    });
    expect((await api.patch(`/api/projects/${project.id}`).send({ name: 'allgemein' })).status).toBe(409);
    expect((await api.patch('/api/projects/999').send({ name: 'x' })).status).toBe(404);
  });

  it('validates name and color', async () => {
    expect((await api.post('/api/projects').send({ name: '  ', color: 'red' })).status).toBe(400);
    expect((await api.post('/api/projects').send({ name: 'x', color: 'orange' })).status).toBe(400);
    expect((await api.post('/api/projects').send({ name: 'x'.repeat(61), color: 'red' })).status).toBe(400);
  });
});

describe('isolation', () => {
  it('keeps notes, tags and tasks of projects apart', async () => {
    const other = await createProject('Privat');
    await createNote(1, 'Arbeit', ['shared', 'work']);
    await createNote(other.id, 'Einkauf', ['shared', 'home']);
    await createTask(1, 'Task 1');
    await createTask(other.id, 'Task 2');

    const titles = async (p: number) => (await api.get(`/api/projects/${p}/notes`)).body.map((n: { title: string }) => n.title);
    expect(await titles(1)).toEqual(['Arbeit']);
    expect(await titles(other.id)).toEqual(['Einkauf']);

    const tagNames = async (p: number) => (await api.get(`/api/projects/${p}/tags`)).body.map((t: { name: string }) => t.name);
    expect(await tagNames(1)).toEqual(['shared', 'work']);
    expect(await tagNames(other.id)).toEqual(['home', 'shared']);

    const board = (await api.get(`/api/projects/${other.id}/board`)).body;
    expect(board.tasks.map((t: { title: string }) => t.title)).toEqual(['Task 2']);
    expect(board.tasks[0]).toMatchObject({ projectId: other.id, position: 1 });
  });

  it('filters by query and tag only within the project', async () => {
    const other = await createProject('Privat');
    await createNote(1, 'Meeting A', ['x']);
    await createNote(other.id, 'Meeting B', ['x']);
    expect((await api.get(`/api/projects/${other.id}/notes?q=meeting&tag=x`)).body.map((n: { title: string }) => n.title)).toEqual([
      'Meeting B',
    ]);
  });

  it('creates converted tasks only in the note\'s own project', async () => {
    const other = await createProject('Privat');
    const note = await createNote(1, 'Arbeit');

    expect((await createTask(other.id, 'Wrong project', note.id)).status).toBe(400);
    const ok = await createTask(1, 'Right project', note.id);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ projectId: 1, sourceNote: { id: note.id } });
  });

  it('reorders only within the task\'s project', async () => {
    const other = await createProject('Privat');
    const a = (await createTask(1, 'A')).body;
    const b = (await createTask(other.id, 'B')).body;
    // Each task moves to its own project's second column.
    for (const task of [a, b]) {
      const { columns, lanes } = (await api.get(`/api/projects/${task.projectId}/board`)).body;
      await api.post(`/api/tasks/${task.id}/move`).send({ columnId: columns[1].id, laneId: lanes[0].id, index: 0 });
    }

    expect((await api.get('/api/projects/1/board')).body.tasks.map((t: { title: string }) => t.title)).toEqual(['A']);
    expect((await api.get(`/api/projects/${other.id}/board`)).body.tasks[0]).toMatchObject({ title: 'B', position: 1 });
  });

  it('keeps WIP limits per project', async () => {
    const other = await createProject('Privat');
    const todoOf = async (p: number) =>
      (await api.get(`/api/projects/${p}/board`)).body.columns.find((c: { name: string }) => c.name === 'To Do');
    await api.patch(`/api/columns/${(await todoOf(other.id)).id}`).send({ wipLimit: 5 });
    const limit = async (p: number) => (await todoOf(p)).wipLimit;
    expect(await limit(other.id)).toBe(5);
    expect(await limit(1)).toBeNull();
  });

  it('answers 404 for unknown projects and 400 for invalid ids', async () => {
    expect((await api.get('/api/projects/999/notes')).status).toBe(404);
    expect((await api.post('/api/projects/999/tasks').send({ title: 'x', description: '' })).status).toBe(404);
    expect((await api.get('/api/projects/abc/board')).status).toBe(400);
  });
});

describe('deleting projects', () => {
  it('moves the project to the trash, and purging deletes its notes, tasks and unused tags', async () => {
    const other = await createProject('Privat');
    const note = await createNote(other.id, 'Weg', ['only-here', 'shared']);
    await createNote(1, 'Bleibt', ['shared']);
    const task = (await createTask(other.id, 'Weg', note.id)).body;

    expect((await api.delete(`/api/projects/${other.id}`)).status).toBe(204);

    expect((await api.get(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await api.get(`/api/projects/${other.id}/notes`)).status).toBe(404);
    expect((await api.get('/api/projects')).body.map((p: { name: string }) => p.name)).toEqual(['Allgemein']);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM notes WHERE project_id = ?`).get(other.id)).toEqual({ n: 1 });

    expect((await api.delete(`/api/trash/project/${other.id}`)).status).toBe(204);
    expect(db.prepare(`SELECT name FROM tags ORDER BY name`).all()).toEqual([{ name: 'shared' }]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM board_columns WHERE project_id = ?`).get(other.id)).toEqual({ n: 0 });
  });

  it('protects the last project', async () => {
    expect((await api.delete('/api/projects/1')).status).toBe(409);
    const other = await createProject('Privat');
    expect((await api.delete('/api/projects/1')).status).toBe(204);
    expect((await api.delete(`/api/projects/${other.id}`)).status).toBe(409);
    expect((await api.delete('/api/projects/999')).status).toBe(404);
  });
});

describe('migration to projects', () => {
  it('moves existing notes, tasks and WIP limits of a version 3 database into "Allgemein"', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v3.db');
    let upgraded: Db | undefined;
    try {
      const v3 = new Database(file);
      v3.pragma('foreign_keys = ON');
      for (const sql of migrations.slice(0, 3)) v3.exec(sql);
      v3.pragma('user_version = 3');
      v3.exec(`
        INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (7, 'Alt', 'Inhalt', 'c', 'u');
        INSERT INTO tags (id, name) VALUES (1, 'tag');
        INSERT INTO note_tags (note_id, tag_id) VALUES (7, 1);
        INSERT INTO tasks (id, title, description, status, position, source_note_id, created_at, updated_at)
          VALUES (3, 'Alter Task', '', 'review', 2.5, 7, 'c', 'u');
        UPDATE board_columns SET wip_limit = 4 WHERE status = 'review';
      `);
      v3.close();

      upgraded = openDatabase(file);
      const app = request(createApp(upgraded));

      const notes = (await app.get('/api/projects/1/notes')).body;
      expect(notes).toEqual([
        expect.objectContaining({
          id: 7,
          projectId: 1,
          title: 'Alt',
          tags: ['tag'],
          tasks: [{ id: 3, title: 'Alter Task', column: expect.objectContaining({ name: 'Review' }) }],
        }),
      ]);
      const board = (await app.get('/api/projects/1/board')).body;
      const review = board.columns.find((c: { name: string }) => c.name === 'Review');
      expect(review.wipLimit).toBe(4);
      expect(board.tasks[0]).toMatchObject({ id: 3, projectId: 1, columnId: review.id, position: 2.5, sourceNote: { id: 7 } });

      // Ids continue after the migrated rows, and foreign keys are enforced again.
      const fresh = (await app.post('/api/projects/1/notes').send({ title: 'Neu', content: '', tags: [] })).body;
      expect(fresh.id).toBe(8);
      expect(upgraded.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
