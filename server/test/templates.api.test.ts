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

interface Template {
  id: number;
  kind: 'note' | 'task';
  scope: 'project' | 'global';
  name: string;
  title: string;
  content: string;
  defaults: Record<string, unknown>;
}

const newProject = async (name: string) => (await api.post('/api/projects').send({ name, color: 'sky' })).body.id as number;
const list = async (projectId: number, kind?: string) =>
  (await api.get(`/api/projects/${projectId}/templates${kind ? `?kind=${kind}` : ''}`)).body as Template[];
const activities = async (projectId: number) =>
  ((await api.get(`/api/projects/${projectId}/activities`)).body.items as { description: string }[]).map((a) => a.description);

describe('templates', () => {
  it('starts with three templates for all projects', async () => {
    const templates = await list(1);
    expect(templates.map((t) => [t.name, t.kind, t.scope, t.title])).toEqual([
      ['Bug-Report', 'task', 'global', 'Bug: '],
      ['Meeting-Protokoll', 'note', 'global', 'Meeting {{datum}}'],
      ['Sprint-Planning', 'note', 'global', 'Sprint-Planning KW {{kw}}'],
    ]);
    expect(templates[0]!.defaults).toEqual({ priority: 'high', labels: ['Bug'], column: null, lane: null, dueInDays: null });
    expect(templates[1]!.content).toContain('## Agenda\n\n- \n');
    expect((await list(1, 'task')).map((t) => t.name)).toEqual(['Bug-Report']);
  });

  it('keeps project templates to their project and shares global ones', async () => {
    const a = await newProject('A');
    const b = await newProject('B');
    const own = await api.post(`/api/projects/${a}/templates`).send({
      kind: 'task',
      name: 'Einkauf',
      title: 'Einkauf {{datum}}',
      content: '- [ ] Milch',
      defaults: { labels: ['Einkauf'], column: 'To Do', dueInDays: 2 },
    });
    expect(own.status).toBe(201);
    expect(own.body).toMatchObject({ scope: 'project', defaults: { priority: null, labels: ['Einkauf'], column: 'To Do', lane: null, dueInDays: 2 } });
    await api.post(`/api/projects/${a}/templates`).send({ kind: 'note', name: 'Retro', scope: 'global', defaults: { tags: ['Team'] } });

    expect((await list(a)).map((t) => t.name)).toContain('Einkauf');
    expect((await list(b)).map((t) => t.name)).not.toContain('Einkauf');
    expect((await list(b)).find((t) => t.name === 'Retro')).toMatchObject({ scope: 'global', defaults: { tags: ['team'] } });
    // Another project cannot change or delete it.
    expect((await api.patch(`/api/projects/${b}/templates/${own.body.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await api.delete(`/api/projects/${b}/templates/${own.body.id}`)).status).toBe(404);
  });

  it('checks names per scope and kind, and the defaults against the kind', async () => {
    const a = await newProject('A');
    expect((await api.post(`/api/projects/${a}/templates`).send({ kind: 'note', name: 'meeting-protokoll', scope: 'global' })).status).toBe(409);
    // Same name in the project is fine: another scope.
    expect((await api.post(`/api/projects/${a}/templates`).send({ kind: 'note', name: 'Meeting-Protokoll' })).status).toBe(201);
    expect((await api.post(`/api/projects/${a}/templates`).send({ kind: 'task', name: 'X', defaults: { dueInDays: -1 } })).status).toBe(400);
    expect((await api.post(`/api/projects/${a}/templates`).send({ kind: 'idea', name: 'X' })).status).toBe(400);

    const note = (await list(a, 'note')).find((t) => t.scope === 'project')!;
    const bad = await api.patch(`/api/projects/${a}/templates/${note.id}`).send({ defaults: { tags: 'kein array' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('defaults.tags');
  });

  it('logs creating, renaming, editing and deleting in the project it happens in', async () => {
    const a = await newProject('A');
    const created = (await api.post(`/api/projects/${a}/templates`).send({ kind: 'note', name: 'Retro', scope: 'global' })).body as Template;
    await api.patch(`/api/projects/${a}/templates/${created.id}`).send({ name: 'Retrospektive', content: '## Gut' });
    await api.delete(`/api/projects/${a}/templates/${created.id}`);
    expect(await activities(a)).toEqual([
      'Notizvorlage „Retrospektive“ gelöscht',
      'Notizvorlage „Retrospektive“ bearbeitet',
      'Notizvorlage „Retro“ in „Retrospektive“ umbenannt',
      'Notizvorlage „Retro“ angelegt (für alle Projekte)',
      'Projekt „A“ angelegt',
    ]);
  });

  it('follows a renamed label in the project templates', async () => {
    const a = await newProject('A');
    await api.post(`/api/projects/${a}/templates`).send({ kind: 'task', name: 'Fehler', defaults: { labels: ['Bug', 'Dringend'] } });
    const bug = ((await api.get(`/api/projects/${a}/labels`)).body as { id: number; name: string }[]).find((l) => l.name === 'Bug')!;
    await api.patch(`/api/labels/${bug.id}`).send({ name: 'Fehler' });
    expect((await list(a, 'task')).find((t) => t.name === 'Fehler')!.defaults.labels).toEqual(['Fehler', 'Dringend']);
    // The global Bug-Report keeps "Bug": other projects still have that label.
    expect((await list(a, 'task')).find((t) => t.name === 'Bug-Report')!.defaults.labels).toEqual(['Bug']);
  });

  it('survives a backup and restore with labels and templates', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-us17-'));
    const fileDb = openDatabase(path.join(dataDir, 'scrumbanize.db'));
    const fileApi = request(createApp(fileDb, { uploadsDir: path.join(dataDir, 'uploads') }));
    try {
      const a = (await fileApi.post('/api/projects').send({ name: 'A', color: 'sky' })).body.id as number;
      await fileApi.post(`/api/projects/${a}/templates`).send({ kind: 'note', name: 'Nur hier' });
      const zip = (await fileApi.get('/api/backup').buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })).body as Buffer;
      await fileApi.post(`/api/projects/${a}/labels`).send({ name: 'Später', color: 'pink' });
      const prepared = await fileApi.post('/api/backup/restore').attach('file', zip, 'b.zip');
      expect((await fileApi.post(`/api/backup/restore/${prepared.body.token}`)).status).toBe(200);
      expect(((await fileApi.get(`/api/projects/${a}/labels`)).body as { name: string }[]).map((l) => l.name)).toEqual(['Bug', 'Feature', 'Dringend']);
      expect(((await fileApi.get(`/api/projects/${a}/templates`)).body as Template[]).map((t) => t.name)).toContain('Nur hier');
    } finally {
      fileDb.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
