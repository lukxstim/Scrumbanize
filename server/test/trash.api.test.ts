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

const createNote = async (title: string, tags: string[] = [], projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/notes`).send({ title, content: `Inhalt von ${title}`, tags })).body;
const createTask = async (title: string, extra: Record<string, unknown> = {}, projectId = 1) =>
  (await api.post(`/api/projects/${projectId}/tasks`).send({ title, description: '', ...extra })).body;
const createProject = async (name: string) => (await api.post('/api/projects').send({ name, color: 'sky' })).body;
const board = async (projectId = 1) => (await api.get(`/api/projects/${projectId}/board`)).body;
const trash = async (query = '') => (await api.get(`/api/trash${query}`)).body as { type: string; id: number; title: string }[];
const restore = (type: string, id: number) => api.post(`/api/trash/${type}/${id}/restore`);
const descriptions = async (projectId = 1) =>
  ((await api.get(`/api/projects/${projectId}/activities`)).body.items as { description: string }[]).map((a) => a.description);

describe('notes in the trash', () => {
  it('are hidden everywhere and come back with tags and task links', async () => {
    const note = await createNote('Kickoff', ['meeting']);
    const task = await createTask('Agenda', { sourceNoteId: note.id });
    expect((await api.delete(`/api/notes/${note.id}`)).status).toBe(204);

    expect((await api.get('/api/projects/1/notes')).body).toEqual([]);
    expect((await api.get(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await api.put(`/api/notes/${note.id}`).send({ title: 'x', content: '', tags: [] })).status).toBe(404);
    expect((await api.delete(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await api.get('/api/projects/1/tags')).body).toEqual([]);
    expect((await api.get('/api/search?q=Kickoff')).body.notes).toEqual([]);
    expect((await api.get(`/api/tasks/${task.id}`)).body.sourceNote).toBeNull();
    // A trashed note cannot be converted into a task.
    expect((await api.post('/api/projects/1/tasks').send({ title: 'T', description: '', sourceNoteId: note.id })).status).toBe(404);
    expect(await trash()).toMatchObject([{ type: 'note', id: note.id, title: 'Kickoff', projectName: 'Allgemein', snippet: 'Inhalt von Kickoff' }]);

    const restored = await restore('note', note.id);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ type: 'note', item: { id: note.id, tags: ['meeting'], tasks: [{ id: task.id }] } });
    expect((await api.get(`/api/tasks/${task.id}`)).body.sourceNote).toMatchObject({ id: note.id, tags: ['meeting'] });
    expect(await trash()).toEqual([]);
    expect((await descriptions()).slice(0, 2)).toEqual([
      'Notiz „Kickoff“ wiederhergestellt',
      'Notiz „Kickoff“ in den Papierkorb verschoben',
    ]);
  });

  it('are purged with their unused tags; tasks lose the link', async () => {
    const note = await createNote('Weg', ['nur-hier']);
    const task = await createTask('Bleibt', { sourceNoteId: note.id });
    await api.delete(`/api/notes/${note.id}`);
    expect((await api.delete(`/api/trash/note/${note.id}`)).status).toBe(204);

    expect(db.prepare(`SELECT COUNT(*) AS n FROM notes`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM tags`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT source_note_id FROM tasks WHERE id = ?`).get(task.id)).toEqual({ source_note_id: null });
    expect((await descriptions())[0]).toBe('Notiz „Weg“ endgültig gelöscht');
    expect((await restore('note', note.id)).status).toBe(404);
  });
});

describe('tasks in the trash', () => {
  it('are hidden from the board, notes and search, and come back to their cell and position', async () => {
    const note = await createNote('Quelle');
    const a = await createTask('A');
    const b = await createTask('B', { sourceNoteId: note.id });
    await createTask('C');
    await api.delete(`/api/tasks/${b.id}`);

    expect((await board()).tasks.map((t: { title: string }) => t.title)).toEqual(['A', 'C']);
    expect((await api.get(`/api/notes/${note.id}`)).body.tasks).toEqual([]);
    expect((await api.get('/api/search?q=B')).body.tasks).toEqual([]);
    expect((await api.get(`/api/tasks/${b.id}`)).status).toBe(404);
    expect((await api.patch(`/api/tasks/${b.id}`).send({ title: 'x' })).status).toBe(404);
    expect((await api.get('/api/projects')).body[0]).toMatchObject({ taskCount: 2 });

    const restored = (await restore('task', b.id)).body;
    expect(restored).toMatchObject({ type: 'task', item: { id: b.id, columnId: a.columnId } });
    expect((await board()).tasks.map((t: { title: string }) => t.title)).toEqual(['A', 'B', 'C']);
    expect((await descriptions())[0]).toBe('Task „B“ wiederhergestellt (in „Backlog“)');
  });

  it('move along when their column is deleted, so a restore finds a cell', async () => {
    const { columns } = await board();
    const task = await createTask('Alt');
    await api.post(`/api/tasks/${task.id}/move`).send({ columnId: columns[3].id, laneId: task.laneId, index: 0 });
    await api.delete(`/api/tasks/${task.id}`);

    // Only a trashed task is left in "Review": no target needed, it goes to the first remaining column.
    expect((await api.delete(`/api/columns/${columns[3].id}`)).status).toBe(204);
    expect((await restore('task', task.id)).body.item.columnId).toBe(columns[0].id);
  });

  it('do not count for a column delete or WIP limits', async () => {
    const { columns } = await board();
    const task = await createTask('X');
    await api.delete(`/api/tasks/${task.id}`);
    // Backlog holds only a trashed task, so it can be deleted without moveTasksTo.
    expect((await api.delete(`/api/columns/${columns[0].id}`)).status).toBe(204);
  });
});

describe('projects in the trash', () => {
  it('are hidden with their contents; the last project stays', async () => {
    const p = await createProject('Studium');
    const note = await createNote('Skript', [], p.id);
    await createTask('Lernen', {}, p.id);
    expect((await api.delete(`/api/projects/${p.id}`)).status).toBe(204);

    expect((await api.get('/api/projects')).body.map((x: { name: string }) => x.name)).toEqual(['Allgemein']);
    expect((await api.get(`/api/projects/${p.id}/board`)).status).toBe(404);
    expect((await api.get(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await api.get('/api/search?q=Skript')).body.notes).toEqual([]);
    expect((await api.delete('/api/projects/1')).status).toBe(409);
    // Only the project is listed; its notes and tasks come back with it.
    expect(await trash()).toMatchObject([{ type: 'project', id: p.id, title: 'Studium', noteCount: 1, taskCount: 1 }]);
    // Its name is free again.
    expect((await api.post('/api/projects').send({ name: 'studium', color: 'red' })).status).toBe(201);
  });

  it('come back with their contents, renamed if the name is taken; items trashed before stay in the trash', async () => {
    const p = await createProject('Studium');
    const kept = await createNote('Bleibt', [], p.id);
    const trashedBefore = await createNote('Schon weg', [], p.id);
    await api.delete(`/api/notes/${trashedBefore.id}`);
    await api.delete(`/api/projects/${p.id}`);
    await createProject('Studium');

    const restored = (await restore('project', p.id)).body;
    expect(restored).toMatchObject({ type: 'project', item: { id: p.id, name: 'Studium (2)', noteCount: 1 }, renamedFrom: 'Studium' });
    expect((await api.get(`/api/projects/${p.id}/notes`)).body.map((n: { id: number }) => n.id)).toEqual([kept.id]);
    expect((await trash(`?project=${p.id}`)).map((i) => i.id)).toEqual([trashedBefore.id]);
    expect((await descriptions(p.id))[0]).toBe('Projekt „Studium“ wiederhergestellt als „Studium (2)“');
  });
});

describe('the trash', () => {
  it('lists one project or all, newest first, with trashed projects always included', async () => {
    const p = await createProject('Privat');
    const gone = await createProject('Weg');
    const n1 = await createNote('N1');
    const t1 = await createTask('T1', {}, p.id);
    // Deleted one after the other: on a fast machine two deletions can share a millisecond, and the order between a
    // note and a task deleted at the same moment is not defined.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    await api.delete(`/api/notes/${n1.id}`);
    await tick();
    await api.delete(`/api/tasks/${t1.id}`);
    await tick();
    await api.delete(`/api/projects/${gone.id}`);

    expect((await trash()).map((i) => `${i.type}:${i.title}`)).toEqual(['project:Weg', 'task:T1', 'note:N1']);
    expect((await trash('?project=1')).map((i) => `${i.type}:${i.title}`)).toEqual(['project:Weg', 'note:N1']);
    expect((await api.get(`/api/trash?project=${gone.id}`)).status).toBe(404);
    expect((await api.get('/api/trash?project=abc')).status).toBe(400);
  });

  it('empties one project with a single log entry, or everything', async () => {
    const p = await createProject('Privat');
    for (const title of ['A', 'B']) await api.delete(`/api/notes/${(await createNote(title)).id}`);
    await api.delete(`/api/tasks/${(await createTask('T')).id}`);
    await api.delete(`/api/notes/${(await createNote('Anderes', [], p.id)).id}`);
    const gone = await createProject('Weg');
    // Later than the note above for sure, so "newest first" has one answer (see the test before).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await api.delete(`/api/projects/${gone.id}`);

    expect((await api.delete('/api/trash?project=1')).body).toEqual({ notes: 2, tasks: 1, projects: 0 });
    expect((await descriptions())[0]).toBe('Papierkorb geleert (2 Notizen, 1 Task)');
    expect((await trash()).map((i) => i.title)).toEqual(['Weg', 'Anderes']);

    expect((await api.delete('/api/trash')).body).toEqual({ notes: 1, tasks: 0, projects: 1 });
    expect(await trash()).toEqual([]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE id = ?`).get(gone.id)).toEqual({ n: 0 });
  });

  it('rejects unknown types and items that are not in the trash', async () => {
    const note = await createNote('Da');
    expect((await restore('note', note.id)).status).toBe(404);
    expect((await api.delete(`/api/trash/note/${note.id}`)).status).toBe(404);
    expect((await restore('board', 1)).status).toBe(400);
  });
});

describe('migration', () => {
  it('adds the trash to a version 7 database and keeps names, logs and data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v7.db');
    let upgraded: Db | undefined;
    try {
      const v7 = new Database(file);
      for (const sql of migrations.slice(0, 7)) v7.exec(sql);
      v7.pragma('user_version = 7');
      v7.exec(`INSERT INTO projects (name, color, created_at, updated_at) VALUES ('Zweites', 'red', 'c', 'u')`);
      v7.exec(`INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (2, 'Alt', '', 'c', 'u')`);
      v7.exec(`INSERT INTO activities (project_id, entity_type, entity_id, action_type, description, created_at)
               VALUES (2, 'note', 1, 'create', 'Notiz „Alt“ erstellt', 'c')`);
      v7.close();

      upgraded = openDatabase(file);
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT id, name, deleted_at FROM projects ORDER BY id`).all()).toEqual([
        { id: 1, name: 'Allgemein', deleted_at: null },
        { id: 2, name: 'Zweites', deleted_at: null },
      ]);
      expect(upgraded.prepare(`SELECT title FROM live_notes`).all()).toEqual([{ title: 'Alt' }]);
      expect(upgraded.prepare(`SELECT description FROM activities`).all()).toEqual([{ description: 'Notiz „Alt“ erstellt' }]);
      // Names stay unique (case-insensitive) outside the trash only.
      const insert = upgraded.prepare(`INSERT INTO projects (name, color, created_at, updated_at) VALUES (?, 'red', 'c', 'u')`);
      expect(() => insert.run('zweites')).toThrow(/UNIQUE/);
      upgraded.exec(`UPDATE projects SET deleted_at = 'd' WHERE id = 2`);
      expect(() => insert.run('zweites')).not.toThrow();
      expect(upgraded.prepare(`SELECT COUNT(*) AS n FROM live_notes`).get()).toEqual({ n: 0 });
      // Notes and the log still point at the rebuilt projects table.
      expect(upgraded.pragma('foreign_key_check')).toEqual([]);
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
