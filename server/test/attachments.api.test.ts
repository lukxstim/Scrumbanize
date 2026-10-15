import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { migrations, openDatabase, type Db } from '../src/database.js';
import { createAttachmentsRepository } from '../src/repositories/attachmentsRepository.js';

let db: Db;
let api: ReturnType<typeof request>;
let uploadsDir: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-test-uploads-'));
  api = request(createApp(db, { uploadsDir }));
});

afterEach(() => {
  db.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cf00000301010018dd8db00000000049454e44ae426082', 'hex');
const createNote = async (title = 'Kickoff') => (await api.post('/api/projects/1/notes').send({ title, content: '', tags: [] })).body;
const createTask = async (title = 'Angebot') => (await api.post('/api/projects/1/tasks').send({ title, description: '' })).body;
const upload = (owner: string, id: number, files: [Buffer | string, string][]) => {
  let req = api.post(`/api/${owner}/${id}/attachments`);
  for (const [content, name] of files) req = req.attach('files', Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  return req;
};
/** Files in the uploads folder itself (not the incoming one). */
const storedFiles = () => fs.readdirSync(uploadsDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);

describe('uploading', () => {
  it('stores files under random names and lists them on the note', async () => {
    const note = await createNote();
    const res = await upload('notes', note.id, [
      [PNG, 'Skizze.png'],
      ['Hallo', 'Übersicht März.txt'],
    ]);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject([
      { fileName: 'Skizze.png', mimeType: 'image/png', size: PNG.length },
      { fileName: 'Übersicht März.txt', mimeType: 'text/plain; charset=utf-8', size: 5 },
    ]);
    expect(storedFiles()).toHaveLength(2);
    expect(storedFiles().every((name) => /^[0-9a-f-]{36}\.(png|txt)$/.test(name))).toBe(true);
    expect((await api.get(`/api/notes/${note.id}`)).body.attachments.map((a: { fileName: string }) => a.fileName)).toEqual([
      'Skizze.png',
      'Übersicht März.txt',
    ]);
    expect((await api.get('/api/projects/1/notes')).body[0].attachments).toHaveLength(2);
    expect((await api.get('/api/projects/1/activities')).body.items[0].description).toBe('2 Dateien an Notiz „Kickoff“ angehängt');
  });

  it('attaches files to tasks, shown on the board', async () => {
    const task = await createTask();
    await upload('tasks', task.id, [['%PDF-1.4', 'Angebot.pdf']]);
    const board = (await api.get('/api/projects/1/board')).body;
    expect(board.tasks[0].attachments).toMatchObject([{ fileName: 'Angebot.pdf', mimeType: 'application/pdf' }]);
  });

  it('refuses unknown types, SVG, too many and too large files, and missing owners', async () => {
    const note = await createNote();
    expect((await upload('notes', note.id, [['<svg/>', 'logo.svg']])).status).toBe(415);
    expect((await upload('notes', note.id, [['MZ', 'tool.exe']])).status).toBe(415);
    expect((await upload('notes', note.id, Array.from({ length: 11 }, (_, i) => ['x', `${i}.txt`] as [string, string]))).status).toBe(400);
    expect((await upload('notes', note.id, [[Buffer.alloc(25 * 1024 * 1024 + 1), 'gross.zip']])).status).toBe(413);
    expect((await api.post(`/api/notes/${note.id}/attachments`)).status).toBe(400);
    expect((await upload('notes', 999, [['x', 'a.txt']])).status).toBe(404);
    expect(storedFiles()).toEqual([]);
    // Rejected uploads leave nothing behind in the incoming folder either.
    expect(fs.readdirSync(path.join(uploadsDir, '.incoming'))).toEqual([]);
  });
});

describe('serving files', () => {
  it('shows images and PDFs inline, downloads the rest, and never runs them as pages', async () => {
    const note = await createNote();
    const [png, pdf, docx] = (
      await upload('notes', note.id, [
        [PNG, 'Bild.png'],
        ['%PDF-1.4', 'Plan.pdf'],
        ['PK', 'Bericht Ä.docx'],
      ])
    ).body as { id: number }[];

    const image = await api.get(`/api/attachments/${png!.id}/file`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['content-disposition']).toBe(`inline; filename="Bild.png"; filename*=UTF-8''Bild.png`);
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(image.body, PNG)).toBe(0);

    const asDownload = await api.get(`/api/attachments/${png!.id}/file?download=1`);
    expect(asDownload.headers['content-disposition']).toMatch(/^attachment;/);

    const plan = await api.get(`/api/attachments/${pdf!.id}/file`);
    expect(plan.headers['content-disposition']).toMatch(/^inline;/);
    expect(plan.headers['content-security-policy']).toBeUndefined(); // the PDF viewer does not work in a sandbox

    const report = await api.get(`/api/attachments/${docx!.id}/file`);
    expect(report.headers['content-disposition']).toBe(`attachment; filename="Bericht _.docx"; filename*=UTF-8''Bericht%20%C3%84.docx`);
  });
});

describe('deleting', () => {
  it('removes an attachment with its file and logs it', async () => {
    const note = await createNote();
    const [a] = (await upload('notes', note.id, [['x', 'Notiz.md']])).body as { id: number }[];
    expect((await api.delete(`/api/attachments/${a!.id}`)).status).toBe(204);
    expect(storedFiles()).toEqual([]);
    expect((await api.get(`/api/attachments/${a!.id}/file`)).status).toBe(404);
    expect((await api.delete(`/api/attachments/${a!.id}`)).status).toBe(404);
    expect((await api.get('/api/projects/1/activities')).body.items[0].description).toBe('Datei „Notiz.md“ von Notiz „Kickoff“ entfernt');
  });

  it('follows the trash: hidden while trashed, back on restore, files gone on purge', async () => {
    const note = await createNote();
    const task = await createTask();
    const [n] = (await upload('notes', note.id, [['x', 'a.txt']])).body as { id: number }[];
    await upload('tasks', task.id, [['y', 'b.txt']]);

    await api.delete(`/api/notes/${note.id}`);
    expect((await api.get(`/api/attachments/${n!.id}/file`)).status).toBe(404);
    expect((await upload('notes', note.id, [['x', 'c.txt']])).status).toBe(404);
    await api.post(`/api/trash/note/${note.id}/restore`);
    expect((await api.get(`/api/attachments/${n!.id}/file`)).status).toBe(200);

    await api.delete(`/api/notes/${note.id}`);
    await api.delete(`/api/trash/note/${note.id}`);
    expect(storedFiles()).toHaveLength(1);

    await api.delete(`/api/tasks/${task.id}`);
    await api.delete('/api/trash?project=1');
    expect(storedFiles()).toEqual([]);
  });

  it('removes the files of a purged project', async () => {
    const p = (await api.post('/api/projects').send({ name: 'Weg', color: 'red' })).body;
    const note = (await api.post(`/api/projects/${p.id}/notes`).send({ title: 'N', content: '', tags: [] })).body;
    await upload('notes', note.id, [['x', 'a.txt']]);
    await api.delete(`/api/projects/${p.id}`);
    expect(storedFiles()).toHaveLength(1);
    await api.delete(`/api/trash/project/${p.id}`);
    expect(storedFiles()).toEqual([]);
  });
});

describe('sweeping', () => {
  it('removes files without a row and old incoming files, but keeps fresh uploads', async () => {
    const note = await createNote();
    await upload('notes', note.id, [['x', 'bleibt.txt']]);
    fs.writeFileSync(path.join(uploadsDir, 'verwaist.txt'), 'x');
    const incoming = path.join(uploadsDir, '.incoming');
    fs.writeFileSync(path.join(incoming, 'laeuft.txt'), 'x');
    fs.writeFileSync(path.join(incoming, 'alt.txt'), 'x');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(path.join(incoming, 'alt.txt'), old, old);

    expect(createAttachmentsRepository(db, uploadsDir).sweep()).toBe(2);
    expect(storedFiles()).toHaveLength(1);
    expect(fs.readdirSync(incoming)).toEqual(['laeuft.txt']);
  });

  it('copes with a missing uploads folder', () => {
    expect(createAttachmentsRepository(db, path.join(uploadsDir, 'gibt-es-nicht')).sweep()).toBe(0);
  });
});

describe('migration', () => {
  it('adds the empty attachments table to a version 9 database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-'));
    let upgraded: Db | undefined;
    try {
      const v9 = new Database(path.join(dir, 'v9.db'));
      for (const sql of migrations.slice(0, 9)) v9.exec(sql);
      v9.pragma('user_version = 9');
      v9.close();
      upgraded = openDatabase(path.join(dir, 'v9.db'));
      expect(upgraded.pragma('user_version', { simple: true })).toBe(migrations.length);
      expect(upgraded.prepare(`SELECT COUNT(*) AS n FROM attachments`).get()).toEqual({ n: 0 });
    } finally {
      upgraded?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
