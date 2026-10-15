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

async function createNote(title = 'Meeting') {
  return (await api.post('/api/projects/1/notes').send({ title, content: '- Angebot schreiben', tags: [] })).body;
}

async function createTask(body: { title: string; description?: string; sourceNoteId?: number }) {
  const res = await api.post('/api/projects/1/tasks').send({ description: '', ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe('tasks', () => {
  it('creates a task from a note in the first column (Backlog)', async () => {
    const note = await createNote();
    const { columns, lanes } = (await api.get('/api/projects/1/board')).body;
    const task = await createTask({ title: '  Angebot schreiben ', description: 'Bis Freitag', sourceNoteId: note.id });

    expect(task).toMatchObject({
      id: expect.any(Number),
      title: 'Angebot schreiben',
      description: 'Bis Freitag',
      columnId: columns[0].id,
      laneId: lanes[0].id,
      position: 1,
      sourceNote: { id: note.id, title: 'Meeting' },
    });
    expect((await api.get(`/api/tasks/${task.id}`)).body).toEqual(task);
  });

  it('creates a task without a source note', async () => {
    expect((await createTask({ title: 'Standalone' })).sourceNote).toBeNull();
  });

  it('appends new tasks to the end of the backlog', async () => {
    await createTask({ title: 'first' });
    await createTask({ title: 'second' });

    const tasks = (await api.get('/api/projects/1/board')).body.tasks;
    expect(tasks.map((t: { title: string; position: number }) => [t.title, t.position])).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('deletes a task', async () => {
    const task = await createTask({ title: 'x' });
    expect((await api.delete(`/api/tasks/${task.id}`)).status).toBe(204);
    expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await api.delete(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it('rejects an empty title and unknown source notes', async () => {
    expect((await api.post('/api/projects/1/tasks').send({ title: '  ', description: '' })).status).toBe(400);
    expect((await api.post('/api/projects/1/tasks').send({ title: 'x', description: '', sourceNoteId: 999 })).status).toBe(404);
  });
});

describe('note-task link', () => {
  it('lists tasks on their note, oldest first', async () => {
    const note = await createNote();
    const a = await createTask({ title: 'A', sourceNoteId: note.id });
    const b = await createTask({ title: 'B', sourceNoteId: note.id });
    const backlog = { id: a.columnId, name: 'Backlog' };
    const expected = [
      { id: a.id, title: 'A', column: backlog },
      { id: b.id, title: 'B', column: backlog },
    ];

    expect((await api.get(`/api/notes/${note.id}`)).body.tasks).toEqual(expected);
    expect((await api.get('/api/projects/1/notes')).body[0].tasks).toEqual(expected);

    const updated = await api.put(`/api/notes/${note.id}`).send({ title: 'Edited', content: '', tags: [] });
    expect(updated.body.tasks).toEqual(expected);
  });

  it('allows converting the same note several times', async () => {
    const note = await createNote();
    await createTask({ title: 'Same', sourceNoteId: note.id });
    await createTask({ title: 'Same', sourceNoteId: note.id });
    expect((await api.get(`/api/notes/${note.id}`)).body.tasks).toHaveLength(2);
  });

  it('removes a deleted task from its note', async () => {
    const note = await createNote();
    const task = await createTask({ title: 'A', sourceNoteId: note.id });
    await api.delete(`/api/tasks/${task.id}`);
    expect((await api.get(`/api/notes/${note.id}`)).body.tasks).toEqual([]);
  });

  it('keeps tasks when their note is deleted', async () => {
    const note = await createNote();
    const task = await createTask({ title: 'Survivor', description: 'kept', sourceNoteId: note.id });

    await api.delete(`/api/notes/${note.id}`);

    expect((await api.get(`/api/tasks/${task.id}`)).body).toMatchObject({
      title: 'Survivor',
      description: 'kept',
      sourceNote: null,
    });
  });

  it('shows the current note title on the task', async () => {
    const note = await createNote('Old');
    const task = await createTask({ title: 'A', sourceNoteId: note.id });
    await api.put(`/api/notes/${note.id}`).send({ title: 'New', content: '', tags: [] });
    expect((await api.get(`/api/tasks/${task.id}`)).body.sourceNote.title).toBe('New');
  });
});

describe('migration', () => {
  it('upgrades a version 1 database without losing notes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v1.db');
    try {
      const v1 = new Database(file);
      v1.exec(migrations[0]!);
      v1.pragma('user_version = 1');
      v1.prepare(`INSERT INTO notes (title, content, created_at, updated_at) VALUES ('Old note', '', 'x', 'x')`).run();
      v1.close();

      const upgraded = openDatabase(file);
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT title FROM notes`).all()).toEqual([{ title: 'Old note' }]);
      expect(upgraded.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 });
      upgraded.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
