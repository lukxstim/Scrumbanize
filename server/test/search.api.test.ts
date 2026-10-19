import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';
import { snippetAround } from '../src/repositories/searchRepository.js';

let db: Db;
let api: ReturnType<typeof request>;
let privat: number;

beforeEach(async () => {
  db = openDatabase(':memory:');
  api = request(createApp(db));
  privat = (await api.post('/api/projects').send({ name: 'Privat', color: 'red' })).body.id;

  await api.post('/api/projects/1/notes').send({ title: 'Sprint Review', content: 'Demo vorbereiten', tags: ['meeting'] });
  await api.post(`/api/projects/${privat}/notes`).send({ title: 'Einkauf', content: 'Milch für das Review-Treffen', tags: [] });
  await api.post(`/api/projects/${privat}/notes`).send({ title: 'Urlaub', content: 'Koffer', tags: ['meeting'] });
  await api.post('/api/projects/1/tasks').send({ title: 'Review-Folien bauen', description: '' });
  await api.post(`/api/projects/${privat}/tasks`).send({ title: 'Steuer', description: 'Belege fürs Review sammeln' });
});

afterEach(() => {
  db.close();
});

const search = async (query: string) => (await api.get(`/api/search?${query}`)).body;

describe('GET /api/search', () => {
  it('finds notes by title, content and tag, and tasks by title and description, across projects', async () => {
    const result = await search('q=review&project=1');
    expect(result.notes.map((n: { title: string }) => n.title)).toEqual(['Sprint Review', 'Einkauf']);
    expect(result.tasks.map((t: { title: string }) => t.title)).toEqual(['Review-Folien bauen', 'Steuer']);
    expect(result.tasks[0]).toMatchObject({ projectId: 1, columnName: 'Backlog' });

    expect((await search('q=meeting')).notes.map((n: { title: string }) => n.title).sort()).toEqual(['Sprint Review', 'Urlaub']);
  });

  it('puts hits of the given project first', async () => {
    const result = await search(`q=review&project=${privat}`);
    expect(result.notes[0]).toMatchObject({ title: 'Einkauf', projectId: privat });
    expect(result.tasks[0]).toMatchObject({ title: 'Steuer', projectId: privat });
  });

  it('returns snippets around the match and respects the limit', async () => {
    const result = await search('q=treffen&limit=1');
    expect(result.notes).toEqual([{ id: expect.any(Number), projectId: privat, title: 'Einkauf', snippet: 'Milch für das Review-Treffen' }]);
    expect((await search('q=e&limit=2')).notes).toHaveLength(2);
  });

  it('returns nothing for an empty query and validates parameters', async () => {
    expect(await search('q=%20')).toEqual({ notes: [], tasks: [] });
    expect((await api.get('/api/search?q=x&limit=500')).status).toBe(400);
  });

  it('treats LIKE wildcards literally', async () => {
    expect((await search('q=%25')).notes).toEqual([]);
  });
});

describe('tags on tasks', () => {
  it('includes the source note tags on tasks', async () => {
    const note = (await api.post('/api/projects/1/notes').send({ title: 'N', content: '', tags: ['ux', 'bug'] })).body;
    const task = (await api.post('/api/projects/1/tasks').send({ title: 'T', description: '', sourceNoteId: note.id })).body;
    expect(task.sourceNote).toEqual({ id: note.id, projectId: 1, title: 'N', tags: ['bug', 'ux'], restricted: false });
  });
});

describe('snippetAround', () => {
  it('starts at the beginning for early matches and cuts around later ones', () => {
    expect(snippetAround('Hallo  Welt\nneue Zeile', 'welt')).toBe('Hallo Welt neue Zeile');
    expect(snippetAround('Ein <mark data-color="green">wichtiger</mark> Satz', 'satz')).toBe('Ein wichtiger Satz');
    const long = `${'x'.repeat(100)} Treffer ${'y'.repeat(100)}`;
    expect(snippetAround(long, 'treffer').startsWith('… ')).toBe(true);
    expect(snippetAround(long, 'treffer')).toContain('Treffer');
  });
});

describe('search words and task numbers', () => {
  it('matches every word anywhere, in any order', async () => {
    expect((await search('q=milch%20review')).notes.map((n: { title: string }) => n.title)).toEqual(['Einkauf']);
    // One word in the tag, one in the title.
    expect((await search('q=meeting%20urlaub')).notes.map((n: { title: string }) => n.title)).toEqual(['Urlaub']);
    expect((await search('q=milch%20koffer')).notes).toEqual([]);
  });

  it('cuts the snippet around the first word found', async () => {
    const result = await search('q=treffen%20milch');
    expect(result.notes[0].snippet).toBe('Milch für das Review-Treffen');
  });

  it('finds a task by its number, first', async () => {
    const task = (await api.post(`/api/projects/${privat}/tasks`).send({ title: 'Nummer', description: '' })).body;
    expect((await search(`q=%23${task.id}`)).tasks[0]).toMatchObject({ id: task.id, title: 'Nummer' });
    expect((await search(`q=${task.id}`)).tasks[0]).toMatchObject({ id: task.id });
  });
});
