import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

let dataDir: string;
let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-export-test-'));
  db = openDatabase(':memory:');
  api = request(createApp(db, { uploadsDir: path.join(dataDir, 'uploads') }));
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const binary = (res: NodeJS.ReadableStream, done: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const createNote = async (title: string, content = 'Inhalt', tags: string[] = []) =>
  (await api.post('/api/projects/1/notes').send({ title, content, tags })).body.id as number;

describe('exports', () => {
  it('downloads one note as Markdown or HTML', async () => {
    const id = await createNote('Plan Q4', '- [ ] Start', ['planung']);
    const md = await api.get(`/api/notes/${id}/export?format=md`);
    expect(md.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(md.headers['content-disposition']).toContain('filename="Plan Q4.md"');
    expect(md.text).toContain('# Plan Q4\n\n- [ ] Start');

    const html = await api.get(`/api/notes/${id}/export?format=html`);
    expect(html.headers['content-disposition']).toContain('filename="Plan Q4.html"');
    expect(html.text).toContain('<h1 class="title">Plan Q4</h1>');
    expect((await api.get('/api/notes/999/export')).status).toBe(404);
    expect((await api.get(`/api/notes/${id}/export?format=pdf`)).status).toBe(400);
  });

  it('downloads all notes of a project as ZIP with their attachments', async () => {
    const a = await createNote('Plan');
    await createNote('plan'); // same file name on Windows and macOS
    await createNote('Gelöscht');
    await api.delete(`/api/notes/${await createNote('Papierkorb')}`);
    await api.post(`/api/notes/${a}/attachments`).attach('files', Buffer.from('Daten'), 'liste.txt');

    const res = await api.get('/api/projects/1/export/notes?format=md').buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(files).sort()).toEqual(['Anhänge/Plan/liste.txt', 'Gelöscht.md', 'Plan.md', 'plan (2).md']);
    expect(new TextDecoder().decode(files['Plan.md'])).toContain('- [liste.txt](<Anhänge/Plan/liste.txt>)');
    expect(new TextDecoder().decode(files['Anhänge/Plan/liste.txt'])).toBe('Daten');
    expect((await api.get('/api/projects/999/export/notes')).status).toBe(404);
  });

  it('downloads the board as CSV for Excel', async () => {
    await api.post('/api/projects/1/tasks').send({ title: 'Angebot', description: 'Mit; Semikolon', priority: 'urgent' });
    const res = await api.get('/api/projects/1/export/board.csv');
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/filename\*=UTF-8''Allgemein%20%E2%80%93%20Board%20\d{4}-\d{2}-\d{2}\.csv/);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toMatch(/^﻿ID;Titel;Spalte;Lane;/);
    expect(lines[1]).toMatch(/^1;Angebot;Backlog;Standard;nein;Dringend;;;\d{2}\.\d{2}\.\d{4};.*;"Mit; Semikolon"$/);
  });
});

describe('import', () => {
  const importNotes = (notes: object[]) => api.post('/api/projects/1/import/notes').send({ notes });

  it('creates notes with tags and creation date, numbering titles that exist', async () => {
    await createNote('Idee');
    const res = await importNotes([
      { title: 'Idee', content: 'aus Obsidian', tags: ['Import', 'Projekt X'], createdAt: '2025-03-01T10:00:00.000Z' },
      { title: 'Idee', content: 'noch eine', tags: [] },
      { title: 'Neu', content: '', tags: [] },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.created.map((n: { title: string }) => n.title)).toEqual(['Idee (2)', 'Idee (3)', 'Neu']);

    const imported = (await api.get(`/api/notes/${res.body.created[0].id}`)).body;
    expect(imported).toMatchObject({ content: 'aus Obsidian', tags: ['import', 'projekt x'], createdAt: '2025-03-01T10:00:00.000Z' });
  });

  it('logs one entry per import, also across batches', async () => {
    await importNotes([{ title: 'A', content: '', tags: [] }]);
    await importNotes([
      { title: 'B', content: '', tags: [] },
      { title: 'C', content: '', tags: [] },
    ]);
    const { items } = (await api.get('/api/projects/1/activities')).body as { items: { description: string }[] };
    expect(items.map((a) => a.description)).toEqual(['3 Notizen importiert']);
  });

  it('refuses invalid batches', async () => {
    expect((await importNotes([{ title: '', content: '', tags: [] }])).status).toBe(400);
    expect((await importNotes([{ title: 'X', content: '', tags: [], createdAt: 'gestern' }])).status).toBe(400);
    expect((await importNotes(Array.from({ length: 51 }, (_, i) => ({ title: `N${i}`, content: '', tags: [] })))).status).toBe(400);
    expect((await importNotes([])).status).toBe(400);
    expect((await api.post('/api/projects/999/import/notes').send({ notes: [{ title: 'X', content: '', tags: [] }] })).status).toBe(404);
  });
});
