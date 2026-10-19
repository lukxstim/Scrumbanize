import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { findContentLinks, replaceContentLinks } from '../src/contentLinks.js';
import { openDatabase, type Db } from '../src/database.js';
import { exportContentLinks } from '../src/exports.js';
import { createUsersRepository } from '../src/repositories/usersRepository.js';

describe('content link syntax', () => {
  it('finds [Text](note:42) and [Text](task:17), but not inside code', () => {
    const md = 'Siehe [Plan \\[v2\\]](note:4) und [Angebot](task:17).\n\n`[nicht](note:5)`\n\n```\n[auch nicht](task:6)\n```\n[Web](https://x.de)';
    expect(findContentLinks(md)).toEqual([
      { type: 'note', id: 4, text: 'Plan \\[v2\\]' },
      { type: 'task', id: 17, text: 'Angebot' },
    ]);
    expect(replaceContentLinks(md, (ref) => `<${ref.id}>`)).toContain('`[nicht](note:5)`');
  });

  it('turns links into files or plain text for exports', () => {
    const md = '[A](note:1), [B](note:2) und [C](task:3)';
    expect(exportContentLinks(md, (ref) => (ref.id === 1 ? 'A b.md' : undefined))).toBe('[A](<A b.md>), B und C (#3)');
    expect(exportContentLinks(md)).toBe('A, B und C (#3)');
  });
});

describe('content links (single user)', () => {
  let db: Db;
  let api: ReturnType<typeof request>;
  beforeEach(() => {
    db = openDatabase(':memory:');
    api = request(createApp(db));
  });
  afterEach(() => db.close());

  const note = async (projectId: number, title: string, content = '') =>
    (await api.post(`/api/projects/${projectId}/notes`).send({ title, content, tags: [] })).body as { id: number };
  const task = async (projectId: number, title: string, description = '') =>
    (await api.post(`/api/projects/${projectId}/tasks`).send({ title, description })).body as { id: number };
  const backlinks = async (type: string, id: number) =>
    ((await api.get(`/api/${type}s/${id}/backlinks`)).body as { type: string; title: string }[]).map((b) => `${b.type}:${b.title}`);
  const notebook = async (name: string) => (await api.post('/api/projects').send({ name, color: 'amber', kind: 'notebook' })).body as { id: number };

  it('keeps backlinks in step with the text, the trash and purging', async () => {
    const target = await note(1, 'Ziel');
    const t = await task(1, 'Angebot');
    const source = await note(1, 'Quelle', `Siehe [Ziel](note:${target.id}) und [Angebot](task:${t.id}), nochmal [hier](note:${target.id}).`);
    const fromTask = await task(1, 'Folgeaufgabe', `Grundlage: [Ziel](note:${target.id})`);
    expect(await backlinks('note', target.id)).toEqual(['note:Quelle', 'task:Folgeaufgabe']);
    expect(await backlinks('task', t.id)).toEqual(['note:Quelle']);

    // Edited text: links follow.
    await api.put(`/api/notes/${source.id}`).send({ title: 'Quelle', content: `Nur noch [Angebot](task:${t.id})`, tags: [] });
    await api.patch(`/api/tasks/${fromTask.id}`).send({ description: 'ohne Link' });
    expect(await backlinks('note', target.id)).toEqual([]);
    expect(await backlinks('task', t.id)).toEqual(['note:Quelle']);

    // Trashed sources are hidden, restored ones come back, purged ones are gone.
    await api.delete(`/api/notes/${source.id}`);
    expect(await backlinks('task', t.id)).toEqual([]);
    await api.post(`/api/trash/note/${source.id}/restore`);
    expect(await backlinks('task', t.id)).toEqual(['note:Quelle']);
    await api.delete(`/api/notes/${source.id}`);
    await api.delete(`/api/trash/note/${source.id}`);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM content_links`).get()).toEqual({ n: 0 });
  });

  it('gives tasks their linked notes, either way and from notebooks, without the source note', async () => {
    const book = await notebook('Rezepte');
    const recipe = await note(book.id, 'Carbonara');
    const plan = await note(1, 'Plan');
    const source = await note(1, 'Ursprung');
    const t = (await api.post('/api/projects/1/tasks').send({ title: 'Kochen', description: `[Carbonara](note:${recipe.id}) [Ursprung](note:${source.id})`, sourceNoteId: source.id })).body as { id: number };
    await api.put(`/api/notes/${plan.id}`).send({ title: 'Plan', content: `Morgen: [Kochen](task:${t.id})`, tags: [] });
    const linked = async () => ((await api.get(`/api/tasks/${t.id}`)).body.linkedNotes as { title: string; projectKind: string; projectName: string }[]);

    expect(await linked()).toEqual([
      { id: recipe.id, title: 'Carbonara', projectId: book.id, projectName: 'Rezepte', projectKind: 'notebook' },
      { id: plan.id, title: 'Plan', projectId: 1, projectName: 'Allgemein', projectKind: 'project' },
    ]);
    // On the board, too; a note in the trash drops out.
    const board = (await api.get('/api/projects/1/board')).body as { tasks: { id: number; linkedNotes: unknown[] }[] };
    expect(board.tasks.find((x) => x.id === t.id)!.linkedNotes).toHaveLength(2);
    await api.delete(`/api/notes/${recipe.id}`);
    expect((await linked()).map((n) => n.title)).toEqual(['Plan']);
  });

  it('resolves link targets with their place', async () => {
    const book = await notebook('Rezepte');
    const recipe = await note(book.id, 'Carbonara');
    const t = await task(1, 'Kochen');
    const gone = await note(1, 'Weg');
    await api.delete(`/api/notes/${gone.id}`);
    const res = await api.post('/api/links/resolve').send({
      refs: [
        { type: 'note', id: recipe.id },
        { type: 'task', id: t.id },
        { type: 'note', id: gone.id },
        { type: 'note', id: 9999 },
      ],
    });
    expect(res.body).toEqual([
      { type: 'note', id: recipe.id, status: 'ok', title: 'Carbonara', projectId: book.id, projectName: 'Rezepte', projectKind: 'notebook' },
      { type: 'task', id: t.id, status: 'ok', title: 'Kochen', done: false, projectId: 1, projectName: 'Allgemein', projectKind: 'project' },
      { type: 'note', id: gone.id, status: 'trashed' },
      { type: 'note', id: 9999, status: 'forbidden' },
    ]);
  });

  it('suggests notes and tasks from everywhere, the current project first', async () => {
    const book = await notebook('Rezepte');
    await note(book.id, 'Pasta Carbonara');
    await note(1, 'Pasta-Einkauf');
    const t = await task(1, 'Pasta kochen');
    const titles = async (q: string, project?: number) =>
      ((await api.get('/api/links/candidates').query({ q, ...(project ? { project } : {}) })).body as { type: string; title: string }[]).map(
        (c) => `${c.type}:${c.title}`,
      );
    expect(await titles('pasta', book.id)).toEqual(['note:Pasta Carbonara', 'note:Pasta-Einkauf', 'task:Pasta kochen']);
    expect(await titles('pasta', 1)).toEqual(['note:Pasta-Einkauf', 'note:Pasta Carbonara', 'task:Pasta kochen']);
    expect(await titles(`#${t.id}`)).toContain('task:Pasta kochen');
  });

  it('adds text links to the graph, with linked notes of other places as external nodes', async () => {
    const book = await notebook('Wissen');
    const outside = await note(book.id, 'Grundlagen');
    const inside = await note(1, 'Innen');
    const t = await task(1, 'Aufgabe', `Siehe [Innen](note:${inside.id}) und [Grundlagen](note:${outside.id})`);
    const graph = (await api.get('/api/projects/1/graph')).body as { nodes: { id: string; external?: { projectName: string } }[]; edges: { source: string; target: string; kind: string }[] };
    const mentions = graph.edges.filter((e) => e.kind === 'mentions');
    expect(mentions).toHaveLength(2);
    expect(mentions).toEqual(
      expect.arrayContaining([
        { source: `task:${t.id}`, target: `note:${inside.id}`, kind: 'mentions' },
        { source: `task:${t.id}`, target: `note:${outside.id}`, kind: 'mentions' },
      ]),
    );
    expect(graph.nodes.find((n) => n.id === `note:${outside.id}`)?.external?.projectName).toBe('Wissen');
    expect(graph.nodes.find((n) => n.id === `note:${inside.id}`)?.external).toBeUndefined();
  });

  it('shows the notebook note a task was converted from as an external node', async () => {
    const book = await notebook('Ideen');
    const idea = await note(book.id, 'Idee');
    const t = (await api.post('/api/projects/1/tasks').send({ title: 'Umsetzen', description: '', sourceNoteId: idea.id })).body as { id: number };
    const graph = (await api.get('/api/projects/1/graph')).body as { nodes: { id: string; external?: unknown }[]; edges: { source: string; target: string; kind: string }[] };
    expect(graph.edges).toContainEqual({ source: `note:${idea.id}`, target: `task:${t.id}`, kind: 'converted' });
    expect(graph.nodes.find((n) => n.id === `note:${idea.id}`)?.external).toMatchObject({ projectName: 'Ideen' });
  });

  it('exports links as text for a single note and the board', async () => {
    const t = await task(1, 'Angebot', 'Ohne Link');
    const n = await note(1, 'Mit Link', `Erledigt in [Angebot](task:${t.id}).`);
    await task(1, 'Verweis', `Aus [Mit Link](note:${n.id})`);
    expect((await api.get(`/api/notes/${n.id}/export?format=md`)).text).toContain(`Erledigt in Angebot (#${t.id}).`);
    const csv = (await api.get('/api/projects/1/export/board.csv')).text;
    expect(csv).toContain('Aus Mit Link');
    expect(csv).not.toContain('note:');
  });
});

describe('content links across users (US-22)', () => {
  let db: Db;
  let app: ReturnType<typeof createApp>;
  let uploads: string;
  const cookie: Record<string, string> = {};
  const userId: Record<string, number> = {};

  beforeEach(() => {
    db = openDatabase(':memory:');
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-links-'));
    app = createApp(db, { auth: 'required', uploadsDir: path.join(uploads, 'uploads') });
    const users = createUsersRepository(db);
    const now = new Date().toISOString();
    for (const name of ['alice', 'bob', 'carol']) {
      userId[name] = (
        db
          .prepare(`INSERT INTO users (email, name, password_hash, system_role, created_at, updated_at) VALUES (?, ?, 'x', 'user', ?, ?) RETURNING id`)
          .get(`${name}@example.com`, name, now, now) as { id: number }
      ).id;
      cookie[name] = `scrumbanize_session=${users.createSession(userId[name]!, 'test').token}`;
    }
    // Project 1 ("Allgemein"): alice owner, bob member. Alice's notebook: carol may read it.
    users.addMember(1, userId.alice!, 'owner');
    users.addMember(1, userId.bob!, 'member');
  });
  afterEach(() => {
    db.close();
    fs.rmSync(uploads, { recursive: true, force: true });
  });

  const as = (who: string) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookie[who]!),
    post: (url: string, body: object) => request(app).post(url).set('Cookie', cookie[who]!).send(body),
  });

  it('shows what is out of reach as "no access", without titles', async () => {
    const alice = as('alice');
    const book = (await alice.post('/api/projects', { name: 'Privat', color: 'pink', kind: 'notebook' })).body;
    createUsersRepository(db).addMember(book.id, userId.carol!, 'viewer');
    const secret = (await alice.post(`/api/projects/${book.id}/notes`, { title: 'Geheim', content: '', tags: [] })).body;
    const shared = (await alice.post('/api/projects/1/notes', { title: 'Geteilt', content: `[Geheim](note:${secret.id})`, tags: [] })).body;
    const t = (await alice.post('/api/projects/1/tasks', { title: 'Aufgabe', description: '' })).body;
    await alice.post(`/api/projects/${book.id}/notes`, { title: 'Privater Verweis', content: `[Aufgabe](task:${t.id})`, tags: [] });

    // Resolving: alice sees the note, bob does not (and cannot tell whether it exists).
    const refs = { refs: [{ type: 'note', id: secret.id }] };
    expect((await alice.post('/api/links/resolve', refs)).body[0]).toMatchObject({ status: 'ok', title: 'Geheim' });
    expect((await as('bob').post('/api/links/resolve', refs)).body[0]).toEqual({ type: 'note', id: secret.id, status: 'forbidden' });
    // Backlinks and suggestions leave out the notebook for bob.
    expect((await alice.get(`/api/tasks/${t.id}/backlinks`)).body).toHaveLength(1);
    expect((await as('bob').get(`/api/tasks/${t.id}/backlinks`)).body).toEqual([]);
    expect((await as('bob').get('/api/links/candidates?q=geheim')).body).toEqual([]);
    // The task's linked notes, too.
    const linked = async (who: string) => ((await as(who).get(`/api/tasks/${t.id}`)).body.linkedNotes as { title: string }[]).map((n) => n.title);
    expect(await linked('alice')).toEqual(['Privater Verweis']);
    expect(await linked('bob')).toEqual([]);
    // The graph of project 1 shows the notebook's note to alice only.
    const nodes = async (who: string) => ((await as(who).get('/api/projects/1/graph')).body.nodes as { id: string }[]).map((n) => n.id);
    expect(await nodes('alice')).toContain(`note:${secret.id}`);
    expect(await nodes('bob')).not.toContain(`note:${secret.id}`);
    expect((await as('bob').get(`/api/notes/${shared.id}`)).status).toBe(200);
  });

  it('converts a notebook note into a project task, hiding each side from those without access', async () => {
    const alice = as('alice');
    const book = (await alice.post('/api/projects', { name: 'Ideen', color: 'violet', kind: 'notebook' })).body;
    createUsersRepository(db).addMember(book.id, userId.carol!, 'viewer');
    const idea = (await alice.post(`/api/projects/${book.id}/notes`, { title: 'Idee', content: '', tags: ['neu'] })).body;

    // Bob may create tasks in project 1, but cannot read the notebook: no conversion.
    expect((await as('bob').post('/api/projects/1/tasks', { title: 'Klau', description: '', sourceNoteId: idea.id })).status).toBe(404);
    const task = (await alice.post('/api/projects/1/tasks', { title: 'Umsetzen', description: '', sourceNoteId: idea.id })).body;
    expect(task.sourceNote).toEqual({ id: idea.id, projectId: book.id, title: 'Idee', tags: ['neu'], restricted: false });

    // Bob sees the task, but not where it came from.
    expect((await as('bob').get(`/api/tasks/${task.id}`)).body.sourceNote).toEqual({ id: idea.id, projectId: book.id, title: '', tags: [], restricted: true });
    // Carol sees the note, but not the task in project 1.
    expect((await as('carol').get(`/api/notes/${idea.id}`)).body.tasks).toEqual([
      { id: task.id, projectId: 1, title: '', column: { id: 0, name: '' }, restricted: true },
    ]);
    expect((await alice.get(`/api/notes/${idea.id}`)).body.tasks[0]).toMatchObject({ title: 'Umsetzen', restricted: false });
  });
});
