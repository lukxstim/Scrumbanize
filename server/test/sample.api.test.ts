import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrations, openDatabase, type Db } from '../src/database.js';
import { SAMPLE_PROJECT_NAME, seedSampleProject } from '../src/sampleProject.js';
import { startServer, type RunningServer } from '../src/start.js';

describe('sample project', () => {
  let db: Db;
  let api: ReturnType<typeof request>;
  const now = new Date(2026, 9, 15, 10, 0); // Thursday, 15.10.2026

  beforeEach(() => {
    db = openDatabase(':memory:', { onCreate: (created) => seedSampleProject(created, now) });
    api = request(createApp(db));
  });
  afterEach(() => db.close());

  it('is created next to "Allgemein" and reported by /api/meta', async () => {
    const projects = (await api.get('/api/projects')).body as { id: number; name: string; noteCount: number; taskCount: number }[];
    expect(projects.map((p) => p.name)).toEqual(['Allgemein', SAMPLE_PROJECT_NAME]);
    const sample = projects[1]!;
    expect(sample).toMatchObject({ noteCount: 1, taskCount: 7 });
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: sample.id });
  });

  it('spreads tasks over the board with priorities, dates, a checklist, a link and the source note', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    const { columns, tasks } = (await api.get(`/api/projects/${id}/board`)).body as {
      columns: { id: number; name: string }[];
      tasks: { title: string; columnId: number; priority: string | null; startDate: string | null; dueDate: string | null; sourceNote: unknown; description: string; links: { kind: string }[] }[];
    };
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));
    const columnOf = (title: string) => columns.find((c) => c.id === byTitle[title]!.columnId)!.name;

    expect(columns.map((c) => tasks.filter((t) => t.columnId === c.id).length)).toEqual([1, 2, 2, 1, 1]);
    expect(columnOf('Scrumbanize installiert 🎉')).toBe('Done');
    expect(byTitle['Dringendes Beispiel']).toMatchObject({ priority: 'urgent', dueDate: '2026-10-14' });
    expect(byTitle['Erstes eigenes Projekt anlegen']).toMatchObject({ startDate: '2026-10-15', dueDate: '2026-10-19' });
    expect(byTitle['Termin im Kalender verschieben']!.sourceNote).toMatchObject({ title: 'So funktioniert Scrumbanize' });
    expect(byTitle['Board kennenlernen']!.description).toContain('- [ ] ');
    expect(byTitle['Abhängigkeit verstehen']!.links).toMatchObject([{ kind: 'blocked_by' }]);

    const note = (await api.get(`/api/projects/${id}/notes`)).body[0];
    expect(note).toMatchObject({ title: 'So funktioniert Scrumbanize', tags: ['beispiel', 'einstieg'] });
    expect(note.tasks).toHaveLength(2);
  });

  it('logs one entry instead of one per note and task', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    const items = (await api.get(`/api/projects/${id}/activities`)).body.items as { description: string }[];
    expect(items.map((i) => i.description)).toEqual(['Beispielprojekt angelegt']);
  });

  it('is no longer reported once it is in the trash or deleted', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    await api.delete(`/api/projects/${id}`);
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: null });
    await api.post(`/api/trash/project/${id}/restore`);
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: id });
  });
});

describe('first start', () => {
  let dir: string;
  let server: RunningServer | undefined;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
  });
  afterEach(async () => {
    await server?.close();
    server = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const projectNames = async () => ((await (await fetch(`${server!.url}/api/projects`)).json()) as { name: string }[]).map((p) => p.name);

  it('creates the sample once, also after it was deleted', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein', SAMPLE_PROJECT_NAME]);
    const { sampleProjectId } = (await (await fetch(`${server.url}/api/meta`)).json()) as { sampleProjectId: number };
    await fetch(`${server.url}/api/projects/${sampleProjectId}`, { method: 'DELETE' });
    await fetch(`${server.url}/api/trash/project/${sampleProjectId}`, { method: 'DELETE' });
    await server.close();

    server = await startServer({ port: 0, host: '127.0.0.1', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein']);
  });

  it('leaves existing installations alone when they are updated', async () => {
    const v10 = new Database(path.join(dir, 'scrumbanize.db'));
    for (const sql of migrations.slice(0, 10)) v10.exec(sql);
    v10.pragma('user_version = 10');
    v10.close();

    server = await startServer({ port: 0, host: '127.0.0.1', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein']);
    expect(await (await fetch(`${server.url}/api/meta`)).json()).toEqual({ sampleProjectId: null });
  });
});
