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

  it('share names with projects, but not with each other', async () => {
    expect((await api.post('/api/projects').send({ name: 'Allgemein', color: 'red', kind: 'notebook' })).status).toBe(201);
    expect((await api.post('/api/projects').send({ name: 'allgemein', color: 'red', kind: 'notebook' })).status).toBe(409);
    expect((await api.post('/api/projects').send({ name: 'allgemein', color: 'red' })).status).toBe(409);
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
