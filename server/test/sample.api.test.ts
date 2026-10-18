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
    expect(sample).toMatchObject({ noteCount: 2, taskCount: 11 });
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: sample.id, desktop: null, restoredAt: null });
  });

  it('spreads tasks over the board with priorities, dates, labels, a checklist, links and their source notes', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    const { columns, tasks } = (await api.get(`/api/projects/${id}/board`)).body as {
      columns: { id: number; name: string; wipLimit: number | null }[];
      tasks: {
        title: string;
        columnId: number;
        priority: string | null;
        startDate: string | null;
        dueDate: string | null;
        sourceNote: { title: string } | null;
        description: string;
        labels: { name: string }[];
        links: { kind: string; task: { title: string } }[];
      }[];
    };
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t]));
    const columnOf = (title: string) => columns.find((c) => c.id === byTitle[title]!.columnId)!.name;

    expect(columns.map((c) => tasks.filter((t) => t.columnId === c.id).length)).toEqual([2, 3, 3, 2, 1]);
    // In Progress is full but not over its limit.
    expect(columns[2]!.wipLimit).toBe(3);
    expect(columnOf('Scrumbanize installiert 🎉')).toBe('Done');
    expect(byTitle['Dringendes Beispiel']).toMatchObject({ priority: 'urgent', dueDate: '2026-10-14' });
    expect(byTitle['Erstes eigenes Projekt anlegen']).toMatchObject({ startDate: '2026-10-15', dueDate: '2026-10-19' });
    // Due on the day of the first start, so the desktop app reminds of it right away.
    expect(byTitle['Erinnerung ausprobieren']!.dueDate).toBe('2026-10-15');
    expect(byTitle['Termin im Kalender verschieben']!.sourceNote).toMatchObject({ title: 'So funktioniert Scrumbanize' });
    expect(byTitle['Backup herunterladen']!.sourceNote).toMatchObject({ title: 'Meeting: Projektstart' });
    expect(byTitle['Board kennenlernen']!.description).toContain('An Fenster anpassen');
    expect(byTitle['Board kennenlernen']!.description).toContain('- [ ] ');

    // The starter labels are in use, so the label filter has something to show.
    const labelled = (name: string) => tasks.filter((t) => t.labels.some((l) => l.name === name)).map((t) => t.title);
    expect(labelled('Dringend')).toEqual(['Erinnerung ausprobieren']);
    expect(labelled('Bug')).toEqual(['Vorlage „Bug-Report“ ausprobieren']);
    expect(labelled('Feature')).toHaveLength(2);

    expect(byTitle['Abhängigkeit verstehen']!.links).toMatchObject([{ kind: 'blocked_by', task: { title: 'Erstes eigenes Projekt anlegen' } }]);
    expect(byTitle['Erinnerung ausprobieren']!.links).toMatchObject([{ kind: 'relates', task: { title: 'Dringendes Beispiel' } }]);

    const notes = (await api.get(`/api/projects/${id}/notes`)).body as { title: string; tags: string[]; tasks: unknown[]; content: string }[];
    const welcome = notes.find((n) => n.title === 'So funktioniert Scrumbanize')!;
    const meeting = notes.find((n) => n.title === 'Meeting: Projektstart')!;
    expect(welcome).toMatchObject({ tags: ['beispiel', 'einstieg'] });
    expect(welcome.tasks).toHaveLength(2);
    expect(meeting).toMatchObject({ tags: ['beispiel', 'meeting'] });
    expect(meeting.tasks).toHaveLength(2);
    expect(meeting.content).toContain('**Datum:** Donnerstag, 15.10.2026');
  });

  it('guides through the features of version 1.1, for Windows and the Mac', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    const notes = (await api.get(`/api/projects/${id}/notes`)).body as { title: string; content: string }[];
    const guide = notes.find((n) => n.title === 'So funktioniert Scrumbanize')!.content;
    for (const text of ['An Fenster anpassen', 'Graph', 'Als Mindmap', 'Statistiken', 'Meeting-Protokoll', 'Backup', 'Strg+Umschalt+Leertaste', '⌘⇧Leertaste', '⌘K']) {
      expect(guide, text).toContain(text);
    }
    // The graph connects both notes with their tasks.
    const graph = (await api.get(`/api/projects/${id}/graph`)).body as { nodes: unknown[]; edges: unknown[] };
    expect(graph.nodes).toHaveLength(13);
    expect(graph.edges).toHaveLength(6);
  });

  it('logs one entry instead of one per note and task', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    const items = (await api.get(`/api/projects/${id}/activities`)).body.items as { description: string }[];
    expect(items.map((i) => i.description)).toEqual(['Beispielprojekt angelegt']);
  });

  it('is no longer reported once it is in the trash or deleted', async () => {
    const id = (await api.get('/api/meta')).body.sampleProjectId;
    await api.delete(`/api/projects/${id}`);
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: null, desktop: null, restoredAt: null });
    await api.post(`/api/trash/project/${id}/restore`);
    expect((await api.get('/api/meta')).body).toEqual({ sampleProjectId: id, desktop: null, restoredAt: null });
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
    server = await startServer({ port: 0, host: '127.0.0.1', auth: 'local', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein', SAMPLE_PROJECT_NAME]);
    const { sampleProjectId } = (await (await fetch(`${server.url}/api/meta`)).json()) as { sampleProjectId: number };
    await fetch(`${server.url}/api/projects/${sampleProjectId}`, { method: 'DELETE' });
    await fetch(`${server.url}/api/trash/project/${sampleProjectId}`, { method: 'DELETE' });
    await server.close();

    server = await startServer({ port: 0, host: '127.0.0.1', auth: 'local', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein']);
  });

  it('tells the client when it runs in the desktop app, with version and release page', async () => {
    const desktop = { version: '1.2.3', releasesUrl: 'https://example.com/releases/latest' };
    server = await startServer({ port: 0, host: '127.0.0.1', auth: 'local', dataDir: dir, desktop });
    expect(await (await fetch(`${server.url}/api/meta`)).json()).toMatchObject({ desktop });
  });

  it('leaves existing installations alone when they are updated', async () => {
    const v10 = new Database(path.join(dir, 'scrumbanize.db'));
    for (const sql of migrations.slice(0, 10)) v10.exec(sql);
    v10.pragma('user_version = 10');
    v10.close();

    server = await startServer({ port: 0, host: '127.0.0.1', auth: 'local', dataDir: dir });
    expect(await projectNames()).toEqual(['Allgemein']);
    expect(await (await fetch(`${server.url}/api/meta`)).json()).toEqual({ sampleProjectId: null, desktop: null, restoredAt: null });
  });
});
