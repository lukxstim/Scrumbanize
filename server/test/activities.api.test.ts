import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeChanges } from '../src/activityText.js';
import { createApp } from '../src/app.js';
import { migrations, openDatabase, type Db } from '../src/database.js';
import { mergeChanges } from '../src/repositories/activityRepository.js';

let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
});

afterEach(() => {
  db.close();
});

interface Entry {
  id: number;
  entityType: string;
  entityId: number | null;
  actionType: string;
  description: string;
  metadata: Record<string, unknown>;
  exists: boolean;
}

const activities = async (query = '', projectId = 1): Promise<{ items: Entry[]; nextCursor: number | null }> =>
  (await api.get(`/api/projects/${projectId}/activities${query}`)).body;
const descriptions = async (query = '', projectId = 1) => (await activities(query, projectId)).items.map((a) => a.description);

/** Makes all existing entries look older than the aggregation window. */
const ageEntries = () => db.prepare(`UPDATE activities SET created_at = '2000-01-01T00:00:00.000Z'`).run();

async function createNote(title: string, tags: string[] = []) {
  return (await api.post('/api/projects/1/notes').send({ title, content: '', tags })).body;
}
const saveNote = (id: number, body: { title: string; content: string; tags: string[] }) => api.put(`/api/notes/${id}`).send(body);

async function board() {
  return (await api.get('/api/projects/1/board')).body as {
    columns: { id: number; name: string }[];
    lanes: { id: number; name: string }[];
  };
}

describe('notes', () => {
  it('logs creating, editing and deleting a note', async () => {
    const note = await createNote('Kickoff', ['meeting']);
    ageEntries();
    await saveNote(note.id, { title: 'Kickoff', content: 'Agenda', tags: ['meeting', 'q4'] });
    await api.delete(`/api/notes/${note.id}`);

    const { items } = await activities();
    expect(items.map((a) => [a.entityType, a.actionType, a.description])).toEqual([
      ['note', 'delete', 'Notiz „Kickoff“ gelöscht'],
      ['note', 'update', 'Notiz „Kickoff“ bearbeitet (Inhalt, Tags +q4)'],
      ['note', 'create', 'Notiz „Kickoff“ erstellt'],
    ]);
    expect(items.every((a) => a.entityId === note.id && a.exists === false)).toBe(true);
  });

  it('folds edits right after creating into the "created" entry (a new note titled while typing)', async () => {
    const note = await createNote('');
    await saveNote(note.id, { title: 'Kick', content: '', tags: [] });
    await saveNote(note.id, { title: 'Kickoff', content: 'x', tags: [] });

    const { items } = await activities();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ actionType: 'create', description: 'Notiz „Kickoff“ erstellt', exists: true });
  });

  it('aggregates auto-save edits within 10 minutes into one entry, with net tag changes', async () => {
    const note = await createNote('Retro', ['a']);
    ageEntries();
    await saveNote(note.id, { title: 'Retro', content: 'one', tags: ['a', 'tmp'] });
    await saveNote(note.id, { title: 'Retro 14', content: 'two', tags: ['b'] });

    expect(await descriptions()).toEqual(['Notiz „Retro 14“ bearbeitet (Inhalt, Titel, Tags +b −a)', 'Notiz „Retro“ erstellt']);

    // After the window, a new entry starts.
    ageEntries();
    await saveNote(note.id, { title: 'Retro 14', content: 'three', tags: ['b'] });
    expect((await descriptions())[0]).toBe('Notiz „Retro 14“ bearbeitet (Inhalt)');
    expect(await descriptions()).toHaveLength(3);
  });

  it('does not log saves that change nothing', async () => {
    const note = await createNote('Same');
    ageEntries();
    await saveNote(note.id, { title: 'Same', content: '', tags: [] });
    expect(await descriptions()).toEqual(['Notiz „Same“ erstellt']);
  });
});

describe('tasks', () => {
  it('logs creating directly and from a note', async () => {
    const note = await createNote('Kickoff');
    await api.post('/api/projects/1/tasks').send({ title: 'Hosting', description: '' });
    await api.post('/api/projects/1/tasks').send({ title: 'Angebot', description: '', sourceNoteId: note.id });

    const { items } = await activities('?type=task');
    expect(items.map((a) => a.description)).toEqual(['Task „Angebot“ aus Notiz „Kickoff“ erstellt', 'Task „Hosting“ in „Backlog“ erstellt']);
    expect(items[0]!.metadata).toMatchObject({ sourceNote: { id: note.id, title: 'Kickoff' }, column: { name: 'Backlog' } });
  });

  it('logs column and lane changes, but not reordering within a cell', async () => {
    const { columns, lanes } = await board();
    const bugs = (await api.post('/api/projects/1/lanes').send({ name: 'Bugs' })).body;
    const a = (await api.post('/api/projects/1/tasks').send({ title: 'A', description: '' })).body;
    await api.post('/api/projects/1/tasks').send({ title: 'B', description: '' });
    const move = (columnId: number, laneId: number, index: number) =>
      api.post(`/api/tasks/${a.id}/move`).send({ columnId, laneId, index });

    await move(columns[0]!.id, lanes[0]!.id, 1); // reorder within Backlog/Standard
    await move(columns[2]!.id, lanes[0]!.id, 0);
    await move(columns[2]!.id, bugs.id, 0);
    await move(columns[3]!.id, lanes[0]!.id, 0);

    const moves = (await activities('?type=task')).items.filter((x) => x.actionType === 'move');
    expect(moves.map((x) => x.description)).toEqual([
      'Task „A“ von „In Progress“ nach „Review“ in Swimlane „Standard“ verschoben',
      'Task „A“ in Swimlane „Bugs“ verschoben',
      'Task „A“ von „Backlog“ nach „In Progress“ verschoben',
    ]);
    expect(moves[2]!.metadata).toMatchObject({ from: { column: 'Backlog' }, to: { column: 'In Progress' } });
  });

  it('aggregates task edits and logs deleting', async () => {
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'Folien', description: '' })).body;
    ageEntries();
    await api.patch(`/api/tasks/${task.id}`).send({ description: 'Entwurf' });
    await api.patch(`/api/tasks/${task.id}`).send({ title: 'Folien bauen' });
    await api.delete(`/api/tasks/${task.id}`);

    expect(await descriptions('?type=task')).toEqual([
      'Task „Folien bauen“ gelöscht',
      'Task „Folien bauen“ bearbeitet (Beschreibung, Titel)',
      'Task „Folien“ in „Backlog“ erstellt',
    ]);
  });
});

describe('board', () => {
  it('logs columns: create, rename, WIP limit, move and delete with moved tasks', async () => {
    const qa = (await api.post('/api/projects/1/columns').send({ name: 'QA' })).body;
    await api.patch(`/api/columns/${qa.id}`).send({ name: 'Testing', wipLimit: 2 });
    await api.patch(`/api/columns/${qa.id}`).send({ wipLimit: null });
    await api.post(`/api/columns/${qa.id}/move`).send({ index: 1 });
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'T', description: '' })).body;
    const { columns, lanes } = await board();
    await api.post(`/api/tasks/${task.id}/move`).send({ columnId: qa.id, laneId: lanes[0]!.id, index: 0 });
    const done = columns.find((c) => c.name === 'Done')!;
    await api.delete(`/api/columns/${qa.id}?moveTasksTo=${done.id}`);

    const entries = (await activities('?type=board')).items;
    expect(entries.map((a) => a.description)).toEqual([
      'Spalte „Testing“ gelöscht, 1 Task nach „Done“ verschoben',
      'Spalte „Testing“ an Position 2 verschoben',
      'WIP-Limit von „Testing“ entfernt',
      'WIP-Limit von „Testing“ auf 2 gesetzt',
      'Spalte „QA“ in „Testing“ umbenannt',
      'Spalte „QA“ angelegt',
    ]);
    expect(entries.every((a) => a.metadata.kind === 'column')).toBe(true);
    expect(entries[0]!.metadata).toMatchObject({ movedTasks: 1, target: { name: 'Done' } });
  });

  it('logs lanes and skips no-op moves and renames', async () => {
    const bugs = (await api.post('/api/projects/1/lanes').send({ name: 'Bugs' })).body;
    await api.patch(`/api/lanes/${bugs.id}`).send({ name: 'Bugs' });
    await api.post(`/api/lanes/${bugs.id}/move`).send({ index: 1 }); // already last
    await api.patch(`/api/lanes/${bugs.id}`).send({ name: 'Fehler' });
    await api.post(`/api/lanes/${bugs.id}/move`).send({ index: 0 });
    await api.delete(`/api/lanes/${bugs.id}`);

    expect(await descriptions('?type=board')).toEqual([
      'Swimlane „Fehler“ gelöscht',
      'Swimlane „Fehler“ an Position 1 verschoben',
      'Swimlane „Bugs“ in „Fehler“ umbenannt',
      'Swimlane „Bugs“ angelegt',
    ]);
  });
});

describe('projects', () => {
  it('logs creating, renaming and recoloring in the project itself', async () => {
    const p = (await api.post('/api/projects').send({ name: 'Studium', color: 'red' })).body;
    await api.patch(`/api/projects/${p.id}`).send({ name: 'Studium', color: 'red' });
    await api.patch(`/api/projects/${p.id}`).send({ name: 'Studium WS', color: 'sky' });

    expect(await descriptions('', p.id)).toEqual([
      'Farbe von Projekt „Studium WS“ geändert',
      'Projekt „Studium“ in „Studium WS“ umbenannt',
      'Projekt „Studium“ angelegt',
    ]);
    expect(await descriptions('')).toEqual([]);
  });

  it('deletes the log with the project', async () => {
    const p = (await api.post('/api/projects').send({ name: 'Weg', color: 'red' })).body;
    await api.post(`/api/projects/${p.id}/notes`).send({ title: 'N', content: '', tags: [] });
    await api.delete(`/api/projects/${p.id}`);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM activities WHERE project_id = ?`).get(p.id)).toEqual({ n: 0 });
  });
});

describe('GET /api/projects/:id/activities', () => {
  it('pages newest first with a cursor', async () => {
    for (const title of ['1', '2', '3', '4', '5']) await createNote(title);

    const first = await activities('?limit=2');
    expect(first.items.map((a) => a.description)).toEqual(['Notiz „5“ erstellt', 'Notiz „4“ erstellt']);
    const second = await activities(`?limit=2&before=${first.nextCursor}`);
    expect(second.items.map((a) => a.description)).toEqual(['Notiz „3“ erstellt', 'Notiz „2“ erstellt']);
    const third = await activities(`?limit=2&before=${second.nextCursor}`);
    expect(third.items.map((a) => a.description)).toEqual(['Notiz „1“ erstellt']);
    expect(third.nextCursor).toBeNull();
  });

  it('filters by area and validates parameters', async () => {
    await createNote('N');
    await api.post('/api/projects/1/tasks').send({ title: 'T', description: '' });
    expect(await descriptions('?type=note')).toEqual(['Notiz „N“ erstellt']);
    expect((await api.get('/api/projects/1/activities?type=tag')).status).toBe(400);
    expect((await api.get('/api/projects/1/activities?limit=500')).status).toBe(400);
    expect((await api.get('/api/projects/999/activities')).status).toBe(404);
  });

  it('marks whether linked notes and tasks still exist', async () => {
    const note = await createNote('Bleibt');
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'Weg', description: '' })).body;
    await api.delete(`/api/tasks/${task.id}`);
    const byEntity = Object.fromEntries((await activities()).items.map((a) => [`${a.entityType}-${a.actionType}`, a.exists]));
    expect(byEntity).toEqual({ 'note-create': true, 'task-create': false, 'task-delete': false });
    expect(note.id).toBeDefined();
  });
});

describe('helpers', () => {
  it('merges edits with net tag changes', () => {
    expect(
      mergeChanges({ fields: ['content'], tagsAdded: ['x', 'tmp'], tagsRemoved: ['a'] }, { fields: ['title'], tagsAdded: ['a'], tagsRemoved: ['tmp'] }),
    ).toEqual({ fields: ['content', 'title'], tagsAdded: ['x'], tagsRemoved: [] });
  });

  it('describes changes', () => {
    expect(describeChanges({ fields: ['title'], tagsAdded: ['q4'], tagsRemoved: ['alt'] })).toBe('Titel, Tags +q4 −alt');
    expect(describeChanges({ fields: [], tagsAdded: [], tagsRemoved: [] })).toBe('');
  });
});

describe('migration', () => {
  it('adds the empty activities table to a version 5 database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'v5.db');
    let upgraded: Db | undefined;
    try {
      const v5 = new Database(file);
      for (const sql of migrations.slice(0, 5)) v5.exec(sql);
      v5.pragma('user_version = 5');
      v5.exec(`INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (1, 'Alt', '', 'c', 'u')`);
      v5.close();

      upgraded = openDatabase(file);
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT COUNT(*) AS n FROM activities`).get()).toEqual({ n: 0 });
      expect(upgraded.prepare(`SELECT title FROM notes`).all()).toEqual([{ title: 'Alt' }]);
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
