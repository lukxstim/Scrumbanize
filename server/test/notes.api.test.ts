import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

async function createNote(body: { title?: string; content?: string; tags?: string[] }) {
  const res = await api.post('/api/notes').send({ title: '', content: '', tags: [], ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe('notes CRUD', () => {
  it('creates a note and normalizes its tags', async () => {
    const note = await createNote({ title: '  Meeting  ', content: '# Agenda', tags: ['Work', ' work ', 'Q3  Planning', ''] });

    expect(note).toMatchObject({ id: expect.any(Number), title: 'Meeting', content: '# Agenda', tags: ['q3 planning', 'work'] });
    expect(note.createdAt).toBe(note.updatedAt);
  });

  it('reads, lists, updates and deletes a note', async () => {
    const created = await createNote({ title: 'First', tags: ['a'] });

    expect((await api.get(`/api/notes/${created.id}`)).body).toEqual(created);
    expect((await api.get('/api/notes')).body).toEqual([created]);

    const updated = await api.put(`/api/notes/${created.id}`).send({ title: 'Renamed', content: 'Body', tags: ['b'] });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: created.id, title: 'Renamed', content: 'Body', tags: ['b'], createdAt: created.createdAt });

    expect((await api.delete(`/api/notes/${created.id}`)).status).toBe(204);
    expect((await api.get(`/api/notes/${created.id}`)).status).toBe(404);
    expect((await api.get('/api/notes')).body).toEqual([]);
  });

  it('lists the most recently updated note first', async () => {
    const older = await createNote({ title: 'older' });
    const newer = await createNote({ title: 'newer' });
    await new Promise((resolve) => setTimeout(resolve, 5)); // updated_at has millisecond resolution
    await api.put(`/api/notes/${older.id}`).send({ title: 'older, edited', content: '', tags: [] });

    const titles = (await api.get('/api/notes')).body.map((n: { title: string }) => n.title);
    expect(titles).toEqual(['older, edited', newer.title]);
  });
});

describe('tags', () => {
  it('counts tags and removes tags no note uses anymore', async () => {
    const a = await createNote({ tags: ['shared', 'only-a'] });
    await createNote({ tags: ['shared'] });

    expect((await api.get('/api/tags')).body).toEqual([
      { id: expect.any(Number), name: 'only-a', noteCount: 1 },
      { id: expect.any(Number), name: 'shared', noteCount: 2 },
    ]);

    await api.put(`/api/notes/${a.id}`).send({ title: '', content: '', tags: [] });
    expect((await api.get('/api/tags')).body).toEqual([{ id: expect.any(Number), name: 'shared', noteCount: 1 }]);

    await api.delete(`/api/notes/${a.id}`);
    expect((await api.get('/api/tags')).body.map((t: { name: string }) => t.name)).toEqual(['shared']);
  });
});

describe('server-side filtering', () => {
  beforeEach(async () => {
    await createNote({ title: 'Sprint review', content: 'Demo the board', tags: ['work', 'meeting'] });
    await createNote({ title: 'Groceries', content: '100% oat milk', tags: ['home'] });
    await createNote({ title: 'Retro', content: 'What went well', tags: ['work'] });
  });

  const titles = async (query: string) =>
    (await api.get(`/api/notes${query}`)).body.map((n: { title: string }) => n.title).sort();

  it('matches q against title, content and tags, case-insensitively', async () => {
    expect(await titles('?q=REVIEW')).toEqual(['Sprint review']);
    expect(await titles('?q=went')).toEqual(['Retro']);
    expect(await titles('?q=meet')).toEqual(['Sprint review']);
  });

  it('treats LIKE wildcards in q literally', async () => {
    expect(await titles('?q=100%25')).toEqual(['Groceries']);
    expect(await titles('?q=%25')).toEqual(['Groceries']);
    expect(await titles('?q=_')).toEqual([]);
  });

  it('requires every selected tag', async () => {
    expect(await titles('?tag=work')).toEqual(['Retro', 'Sprint review']);
    expect(await titles('?tag=work&tag=meeting')).toEqual(['Sprint review']);
    expect(await titles('?tag=work&tag=home')).toEqual([]);
  });
});

describe('errors', () => {
  it('rejects invalid input with 400', async () => {
    const res = await api.post('/api/notes').send({ title: 42, content: '', tags: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await api.post('/api/notes').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
  });

  it('rejects invalid ids with 400 and unknown ids with 404', async () => {
    expect((await api.get('/api/notes/abc')).status).toBe(400);
    expect((await api.get('/api/notes/999')).status).toBe(404);
    expect((await api.put('/api/notes/999').send({ title: '', content: '', tags: [] })).status).toBe(404);
    expect((await api.delete('/api/notes/999')).status).toBe(404);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await api.get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('persistence', () => {
  it('keeps notes after the database is closed and reopened', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    const file = path.join(dir, 'test.db');
    try {
      const first = openDatabase(file);
      const created = (await request(createApp(first)).post('/api/notes').send({ title: 'Kept', content: 'x', tags: ['t'] })).body;
      first.close();

      const second = openDatabase(file);
      const res = await request(createApp(second)).get(`/api/notes/${created.id}`);
      second.close();

      expect(res.body).toEqual(created);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
