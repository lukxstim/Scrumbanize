import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import Database from 'better-sqlite3';
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

interface Folder {
  id: number;
  parentId: number | null;
  name: string;
}

const newNotebook = async (name = 'Studium', icon?: string) =>
  (await api.post('/api/projects').send({ name, color: 'violet', kind: 'notebook', ...(icon ? { icon } : {}) })).body as {
    id: number;
    kind: string;
    icon: string | null;
  };
const newNote = async (projectId: number, title: string, folderId?: number) =>
  (await api.post(`/api/projects/${projectId}/notes`).send({ title, content: '', tags: [], ...(folderId ? { folderId } : {}) })).body as {
    id: number;
    folderId: number | null;
  };
const newFolder = (projectId: number, name: string, parentId: number | null = null) =>
  api.post(`/api/projects/${projectId}/folders`).send({ name, parentId });
const folders = async (projectId: number) => (await api.get(`/api/projects/${projectId}/folders`)).body as Folder[];
const activities = async (projectId: number) =>
  ((await api.get(`/api/projects/${projectId}/activities`)).body.items as { description: string }[]).map((a) => a.description);

describe('notebooks', () => {
  it('have notes but no board, and a symbol', async () => {
    const book = await newNotebook();
    expect(book).toMatchObject({ kind: 'notebook', icon: 'book' });
    expect((await api.get('/api/projects')).body[0]).toMatchObject({ kind: 'project', icon: null });
    for (const url of ['board', 'analytics', 'export/board.csv']) {
      expect((await api.get(`/api/projects/${book.id}/${url}`)).body.error.code).toBe('notebook');
    }
    expect((await api.post(`/api/projects/${book.id}/tasks`).send({ title: 'T', description: '' })).status).toBe(409);
    expect((await api.post(`/api/projects/${book.id}/columns`).send({ name: 'C' })).status).toBe(409);
    expect((await api.post(`/api/projects/${book.id}/labels`).send({ name: 'L', color: 'red' })).status).toBe(409);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM board_columns WHERE project_id = ?`).get(book.id)).toEqual({ n: 0 });
    // Notes work as in any project.
    await newNote(book.id, 'Vorlesung 1');
    expect((await api.get(`/api/projects/${book.id}/notes`)).body).toHaveLength(1);
    expect(await activities(book.id)).toEqual(expect.arrayContaining(['Notizbuch „Studium“ angelegt']));
  });

  it('change their symbol, not their kind', async () => {
    const book = await newNotebook('Rezepte', 'utensils');
    expect(book.icon).toBe('utensils');
    const res = await api.patch(`/api/projects/${book.id}`).send({ icon: 'leaf', kind: 'project' });
    expect(res.body).toMatchObject({ kind: 'notebook', icon: 'leaf' });
    expect(await activities(book.id)).toContain('Symbol von Notizbuch „Rezepte“ geändert');
    expect((await api.post('/api/projects').send({ name: 'X', color: 'red', kind: 'notebook', icon: 'unicorn' })).status).toBe(400);
  });

  it('share no names, with each other or with projects (US-26: one area)', async () => {
    expect((await api.post('/api/projects').send({ name: 'Allgemein', color: 'red', kind: 'notebook' })).status).toBe(409);
    expect((await api.post('/api/projects').send({ name: 'Rezepte', color: 'red', kind: 'notebook' })).status).toBe(201);
    expect((await api.post('/api/projects').send({ name: 'rezepte', color: 'red', kind: 'notebook' })).status).toBe(409);
    expect((await api.post('/api/projects').send({ name: 'rezepte', color: 'red' })).status).toBe(409);
  });

  it('can all be deleted, while the last project stays', async () => {
    const book = await newNotebook();
    expect((await api.delete(`/api/projects/${book.id}`)).status).toBe(204);
    expect((await api.delete('/api/projects/1')).body.error.code).toBe('last_project');
  });
});

describe('folders', () => {
  it('nest up to five levels, with unique names per level', async () => {
    let parent: number | null = null;
    for (let level = 1; level <= 5; level++) {
      const res = await newFolder(1, `Ebene ${level}`, parent);
      expect(res.status).toBe(201);
      parent = res.body.id;
    }
    expect((await newFolder(1, 'Ebene 6', parent)).body.error.code).toBe('too_deep');
    expect((await newFolder(1, 'ebene 1')).body.error.code).toBe('name_taken');
    expect((await newFolder(1, 'Ebene 2')).status).toBe(201);
    expect(await folders(1)).toHaveLength(6);
  });

  it('move without cycles and within the depth limit', async () => {
    const a = (await newFolder(1, 'A')).body as Folder;
    const b = (await newFolder(1, 'B', a.id)).body as Folder;
    const c = (await newFolder(1, 'C', b.id)).body as Folder;
    expect((await api.patch(`/api/folders/${a.id}`).send({ parentId: c.id })).body.error.code).toBe('invalid_parent');
    expect((await api.patch(`/api/folders/${a.id}`).send({ parentId: a.id })).body.error.code).toBe('invalid_parent');
    // D/E/F (three levels) under A/B/C would make six.
    const d = (await newFolder(1, 'D')).body as Folder;
    const e = (await newFolder(1, 'E', d.id)).body as Folder;
    await newFolder(1, 'F', e.id);
    expect((await api.patch(`/api/folders/${d.id}`).send({ parentId: c.id })).body.error.code).toBe('too_deep');
    expect((await api.patch(`/api/folders/${d.id}`).send({ parentId: b.id })).body).toMatchObject({ parentId: b.id });
    // Reordering at the top level, renaming.
    const g = (await newFolder(1, 'G')).body as Folder;
    await api.patch(`/api/folders/${g.id}`).send({ index: 0, name: 'Erstes' });
    expect((await folders(1)).filter((f) => f.parentId === null).map((f) => f.name)).toEqual(['Erstes', 'A']);
  });

  it('stay in their project', async () => {
    const book = await newNotebook();
    const foreign = (await newFolder(book.id, 'Fremd')).body as Folder;
    expect((await newFolder(1, 'Kind', foreign.id)).body.error.code).toBe('invalid_parent');
    const own = (await newFolder(1, 'Eigen')).body as Folder;
    expect((await api.patch(`/api/folders/${own.id}`).send({ parentId: foreign.id })).body.error.code).toBe('invalid_parent');
    const note = await newNote(1, 'Notiz');
    expect((await api.put(`/api/notes/${note.id}/folder`).send({ folderId: foreign.id })).body.error.code).toBe('invalid_folder');
    expect((await api.post('/api/projects/1/notes').send({ title: 'N', content: '', tags: [], folderId: foreign.id })).body.error.code).toBe('invalid_folder');
  });

  it('hold notes, which move up when the folder is deleted', async () => {
    const outer = (await newFolder(1, 'Außen')).body as Folder;
    const inner = (await newFolder(1, 'Innen', outer.id)).body as Folder;
    const deepest = (await newFolder(1, 'Ganz innen', inner.id)).body as Folder;
    const note = await newNote(1, 'Drin', inner.id);
    expect(note.folderId).toBe(inner.id);
    const loose = await newNote(1, 'Lose');
    expect((await api.put(`/api/notes/${loose.id}/folder`).send({ folderId: outer.id })).body.folderId).toBe(outer.id);

    expect((await api.delete(`/api/folders/${inner.id}`)).status).toBe(204);
    expect((await api.get(`/api/notes/${note.id}`)).body.folderId).toBe(outer.id);
    expect((await folders(1)).find((f) => f.id === deepest.id)?.parentId).toBe(outer.id);

    await api.delete(`/api/folders/${outer.id}`);
    expect((await api.get(`/api/notes/${note.id}`)).body.folderId).toBeNull();
    expect((await folders(1)).map((f) => [f.name, f.parentId])).toEqual([['Ganz innen', null]]);
    // Editing a note keeps its folder.
    await api.put(`/api/notes/${loose.id}/folder`).send({ folderId: deepest.id });
    await api.put(`/api/notes/${loose.id}`).send({ title: 'Lose', content: 'neu', tags: [] });
    expect((await api.get(`/api/notes/${loose.id}`)).body.folderId).toBe(deepest.id);
  });
});

describe('the board of a notebook (US-26)', () => {
  const board = (id: number) => api.get(`/api/projects/${id}/board`);

  it('switches on with the default board, and off again keeping its tasks hidden', async () => {
    const book = await newNotebook('Haus');
    const on = await api.patch(`/api/projects/${book.id}`).send({ board: true });
    expect(on.body).toMatchObject({ kind: 'project', icon: 'book' });
    const columns = (await board(book.id)).body.columns as { id: number; name: string }[];
    expect(columns.map((c) => c.name)).toHaveLength(5);
    const task = (await api.post(`/api/projects/${book.id}/tasks`).send({ title: 'Dach prüfen', description: '' })).body as { id: number };

    const off = await api.patch(`/api/projects/${book.id}`).send({ board: false });
    expect(off.body).toMatchObject({ kind: 'notebook', taskCount: 1 });
    expect((await board(book.id)).body.error.code).toBe('notebook');
    expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await api.get('/api/search?q=Dach')).body.tasks ?? []).toHaveLength(0);

    // On again: the same columns and the task where it was, no second default board.
    await api.patch(`/api/projects/${book.id}`).send({ board: true });
    const again = (await board(book.id)).body as { columns: { id: number }[]; tasks: { id: number }[] };
    expect(again.columns.map((c) => c.id)).toEqual(columns.map((c) => c.id));
    expect(again.tasks.map((t) => t.id)).toEqual([task.id]);
    expect(await activities(book.id)).toEqual(
      expect.arrayContaining(['Board von „Haus“ eingeschaltet', 'Board von „Haus“ ausgeschaltet (Aufgaben ausgeblendet)']),
    );
  });

  it('cannot be switched off on the last board', async () => {
    expect((await api.patch('/api/projects/1').send({ board: false })).body.error.code).toBe('last_project');
    const book = await newNotebook();
    await api.patch(`/api/projects/${book.id}`).send({ board: true });
    expect((await api.patch('/api/projects/1').send({ board: false })).body).toMatchObject({ kind: 'notebook' });
  });

  it('renames notebooks that shared a name with a project before the update', () => {
    const old = new Database(':memory:');
    // The migration of US-26 is the one that makes names unique across both kinds again.
    const us26 = migrations.findIndex((sql) => sql.includes("' (Notizbuch)'"));
    migrations.slice(0, us26).forEach((sql) => old.exec(sql));
    const insert = old.prepare(`INSERT INTO projects (name, color, kind, created_at, updated_at) VALUES (?, 'red', ?, '', '')`);
    // "Allgemein" (id 1) comes from an earlier migration.
    insert.run('allgemein', 'notebook');
    insert.run('Uni', 'project');
    insert.run('Uni', 'notebook');
    insert.run('Uni (Notizbuch)', 'notebook');
    insert.run('Rezepte', 'notebook');
    old.exec(migrations[us26]!);
    const names = old.prepare(`SELECT id, name FROM projects ORDER BY id`).all();
    expect(names).toEqual([
      { id: 1, name: 'Allgemein' },
      { id: 2, name: 'allgemein (Notizbuch)' },
      { id: 3, name: 'Uni' },
      { id: 4, name: 'Uni (4)' },
      { id: 5, name: 'Uni (Notizbuch)' },
      { id: 6, name: 'Rezepte' },
    ]);
    old.close();
  });
});

describe('all notes and tags (US-26: of every notebook, with board or without)', () => {
  const titles = (notes: { title: string }[]) => notes.map((n) => n.title);

  it('lists the notes of every notebook, newest first, filtered by text and tags', async () => {
    const studium = await newNotebook('Studium');
    const rezepte = await newNotebook('Rezepte');
    await api.post('/api/projects/1/notes').send({ title: 'Sprint', content: 'Retro', tags: ['meeting'] });
    await api.post(`/api/projects/${rezepte.id}/notes`).send({ title: 'Suppe', content: '', tags: ['meeting'] });
    await api.post(`/api/projects/${studium.id}/notes`).send({ title: 'Vorlesung', content: 'Retro-Notizen', tags: ['meeting', 'uni'] });
    const gone = await newNote(studium.id, 'Weg');
    await api.delete(`/api/notes/${gone.id}`);

    const all = (await api.get('/api/notes')).body as { title: string; projectId: number }[];
    expect(titles(all)).toEqual(['Vorlesung', 'Suppe', 'Sprint']);
    expect(all[0]).toMatchObject({ projectId: studium.id, tags: ['meeting', 'uni'] });

    expect(titles((await api.get('/api/notes?tag=meeting')).body)).toEqual(['Vorlesung', 'Suppe', 'Sprint']);
    expect(titles((await api.get('/api/notes?tag=meeting&tag=uni')).body)).toEqual(['Vorlesung']);
    expect(titles((await api.get('/api/notes?q=retro')).body)).toEqual(['Vorlesung', 'Sprint']);
  });

  it('counts the tags of every notebook', async () => {
    const studium = await newNotebook('Studium');
    await api.post('/api/projects/1/notes').send({ title: 'A', content: '', tags: ['meeting', 'projekt'] });
    await api.post(`/api/projects/${studium.id}/notes`).send({ title: 'B', content: '', tags: ['meeting', 'uni'] });
    const trashed = (await api.post(`/api/projects/${studium.id}/notes`).send({ title: 'C', content: '', tags: ['alt'] })).body;
    await api.delete(`/api/notes/${trashed.id}`);

    const tags = (await api.get('/api/tags')).body as { name: string; noteCount: number }[];
    expect(tags.map((t) => [t.name, t.noteCount])).toEqual([
      ['meeting', 2],
      ['projekt', 1],
      ['uni', 1],
    ]);
  });
});

describe('moving a note into another notebook (US-34)', () => {
  it('moves it with its tags into a folder or the top level of the other notebook', async () => {
    const from = await newNotebook('Studium');
    const to = await newNotebook('Rezepte');
    const folder = (await newFolder(to.id, 'Kuchen')).body as Folder;
    const note = (await api.post(`/api/projects/${from.id}/notes`).send({ title: 'Apfelkuchen', content: '', tags: ['backen'] })).body as { id: number };

    const moved = await api.put(`/api/notes/${note.id}/folder`).send({ folderId: folder.id, projectId: to.id });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ projectId: to.id, folderId: folder.id, tags: ['backen'] });
    expect((await api.get(`/api/projects/${from.id}/notes`)).body).toEqual([]);

    const back = await api.put(`/api/notes/${note.id}/folder`).send({ folderId: null, projectId: from.id });
    expect(back.body).toMatchObject({ projectId: from.id, folderId: null });
  });

  it('refuses a folder of another notebook and a notebook that does not exist', async () => {
    const from = await newNotebook('Studium');
    const to = await newNotebook('Rezepte');
    const elsewhere = (await newFolder(from.id, 'Mathe')).body as Folder;
    const note = await newNote(from.id, 'Skript');

    expect((await api.put(`/api/notes/${note.id}/folder`).send({ folderId: elsewhere.id, projectId: to.id })).status).toBe(400);
    expect((await api.put(`/api/notes/${note.id}/folder`).send({ folderId: null, projectId: 999 })).status).toBe(404);
    expect((await api.get(`/api/notes/${note.id}`)).body.projectId).toBe(from.id);
  });
});

describe('pages in an order of their own (US-34)', () => {
  it('keeps the order of a folder until a page leaves it', async () => {
    const notebook = await newNotebook('Studium');
    const folder = (await newFolder(notebook.id, 'Mathe')).body as Folder;
    const a = await newNote(notebook.id, 'A', folder.id);
    const b = await newNote(notebook.id, 'B', folder.id);
    const c = await newNote(notebook.id, 'C', folder.id);

    expect((await api.put(`/api/projects/${notebook.id}/notes/order`).send({ folderId: folder.id, ids: [c.id, a.id, b.id] })).status).toBe(204);
    const positions = async () =>
      Object.fromEntries(((await api.get(`/api/projects/${notebook.id}/notes`)).body as { title: string; position: number | null }[]).map((n) => [n.title, n.position]));
    expect(await positions()).toEqual({ C: 0, A: 1, B: 2 });

    await api.put(`/api/notes/${a.id}/folder`).send({ folderId: null });
    expect(await positions()).toEqual({ C: 0, A: null, B: 2 });
  });

  it('refuses an order that is not exactly the pages of the folder', async () => {
    const notebook = await newNotebook('Studium');
    const a = await newNote(notebook.id, 'A');
    const b = await newNote(notebook.id, 'B');
    const order = (ids: number[]) => api.put(`/api/projects/${notebook.id}/notes/order`).send({ folderId: null, ids });
    expect((await order([a.id])).status).toBe(409);
    expect((await order([a.id, a.id])).status).toBe(409);
    expect((await order([b.id, a.id, 999])).status).toBe(409);
    expect((await order([b.id, a.id])).status).toBe(204);
  });
});
