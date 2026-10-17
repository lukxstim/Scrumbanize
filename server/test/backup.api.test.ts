import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SAFETY_COPIES_KEPT, SAFETY_COPY_PREFIX } from '../src/backup.js';
import { migrations, openDatabase, type Db } from '../src/database.js';

let dataDir: string;
let uploadsDir: string;
let db: Db;
let api: ReturnType<typeof request>;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-backup-test-'));
  uploadsDir = path.join(dataDir, 'uploads');
  db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
  api = request(createApp(db, { uploadsDir }));
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Collects a binary response body. */
const binary = (res: NodeJS.ReadableStream & { setEncoding: (e: string) => void }, done: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

async function downloadBackup(): Promise<Buffer> {
  const res = await api.get('/api/backup').buffer(true).parse(binary);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe('application/zip');
  expect(res.headers['content-disposition']).toMatch(/^attachment; filename="scrumbanize-backup-\d{4}-\d{2}-\d{2}\.zip"/);
  return res.body as Buffer;
}

const createNote = async (title: string) =>
  (await api.post('/api/projects/1/notes').send({ title, content: 'Inhalt', tags: [] })).body.id as number;
const attach = (noteId: number, name: string, content: string) =>
  api.post(`/api/notes/${noteId}/attachments`).attach('files', Buffer.from(content), name);
const noteTitles = async () => ((await api.get('/api/projects/1/notes')).body as { title: string }[]).map((n) => n.title).sort();

const prepare = (zip: Buffer | Uint8Array, name = 'backup.zip') => api.post('/api/backup/restore').attach('file', Buffer.from(zip), name);

describe('backup', () => {
  it('contains the manifest, the database and the attachment files', async () => {
    const note = await createNote('Mit Anhang');
    expect((await attach(note, 'liste.txt', 'Milch, Brot')).status).toBe(201);

    const files = unzipSync(new Uint8Array(await downloadBackup()));
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'scrumbanize.db', expect.stringMatching(/^uploads\/.+\.txt$/)]);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest).toMatchObject({
      app: 'scrumbanize',
      format: 1,
      schemaVersion: migrations.length,
      counts: { projects: 1, notes: 1, tasks: 0, attachments: 1 },
    });
    const upload = Object.keys(files).find((n) => n.startsWith('uploads/'))!;
    expect(new TextDecoder().decode(files[upload])).toBe('Milch, Brot');
  });
});

describe('restore', () => {
  it('brings back exactly the state of the backup, files included, after a safety copy', async () => {
    const kept = await createNote('Alt');
    await attach(kept, 'alt.txt', 'alte Datei');
    const backup = await downloadBackup();

    // Change everything after the backup.
    await createNote('Neu');
    await api.delete(`/api/notes/${kept}`);
    await api.delete('/api/trash/note/' + kept);
    expect(await noteTitles()).toEqual(['Neu']);

    const prepared = await prepare(backup);
    expect(prepared.status).toBe(200);
    expect(prepared.body).toMatchObject({
      token: expect.any(String),
      manifest: { app: 'scrumbanize' },
      counts: { projects: 1, notes: 1, attachments: 1 },
      missingFiles: 0,
    });
    // Nothing has changed yet.
    expect(await noteTitles()).toEqual(['Neu']);

    const applied = await api.post(`/api/backup/restore/${prepared.body.token}`);
    expect(applied.status).toBe(200);
    expect(applied.body.safetyCopy).toMatch(new RegExp(`^${SAFETY_COPY_PREFIX}.+\\.zip$`));

    expect(await noteTitles()).toEqual(['Alt']);
    const note = (await api.get(`/api/notes/${kept}`)).body as { attachments: { id: number }[] };
    const file = await api.get(`/api/attachments/${note.attachments[0]!.id}/file`);
    expect(file.text).toBe('alte Datei');
    // New rows continue after the restored ids.
    expect(await createNote('Danach')).toBeGreaterThan(kept);

    // The safety copy holds the state before the restore.
    const copy = unzipSync(new Uint8Array(fs.readFileSync(path.join(dataDir, 'backups', applied.body.safetyCopy))));
    expect(JSON.parse(new TextDecoder().decode(copy['manifest.json'])).counts.notes).toBe(1);
    expect((await api.get('/api/meta')).body.restoredAt).toEqual(expect.any(String));
    // Working folders are gone again.
    expect(fs.readdirSync(path.join(dataDir, '.restore'))).toEqual([]);
  });

  it('migrates a backup from an older version', async () => {
    const oldFile = path.join(dataDir, 'old.db');
    const old = new Database(oldFile);
    // Version 7: projects, notes, tasks, board and activity log exist; trash, links, attachments do not yet.
    for (const migration of migrations.slice(0, 7)) old.exec(migration);
    old.pragma('user_version = 7');
    old.prepare(`INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (1, 'Von früher', '', 'x', 'x')`).run();
    old.close();

    const prepared = await prepare(zipSync({ 'scrumbanize.db': new Uint8Array(fs.readFileSync(oldFile)) }));
    expect(prepared.status).toBe(200);
    expect(prepared.body).toMatchObject({ manifest: null, counts: { notes: 1 } });
    expect((await api.post(`/api/backup/restore/${prepared.body.token}`)).status).toBe(200);
    expect(await noteTitles()).toEqual(['Von früher']);
  });

  it('keeps only the newest safety copies', async () => {
    const backupsDir = path.join(dataDir, 'backups');
    fs.mkdirSync(backupsDir);
    for (let i = 0; i < SAFETY_COPIES_KEPT; i++) fs.writeFileSync(path.join(backupsDir, `${SAFETY_COPY_PREFIX}2020-01-0${i + 1}T00-00-00.zip`), '');
    fs.writeFileSync(path.join(backupsDir, 'eigene-sicherung.zip'), '');

    const prepared = await prepare(await downloadBackup());
    await api.post(`/api/backup/restore/${prepared.body.token}`);
    const left = fs.readdirSync(backupsDir).sort();
    expect(left).toHaveLength(SAFETY_COPIES_KEPT + 1);
    expect(left).not.toContain(`${SAFETY_COPY_PREFIX}2020-01-01T00-00-00.zip`);
    expect(left).toContain('eigene-sicherung.zip');
  });

  it.each<[string, () => Promise<Uint8Array>, string]>([
    ['no ZIP at all', async () => strToU8('kein zip'), 'invalid_backup'],
    ['a ZIP without database', async () => zipSync({ 'notizen.txt': strToU8('x') } as Zippable), 'invalid_backup'],
    ['paths leaving the folder', async () => zipSync({ 'uploads/../../boese.txt': strToU8('x'), 'scrumbanize.db': strToU8('x') }), 'invalid_backup'],
    ['a damaged database', async () => zipSync({ 'scrumbanize.db': strToU8('SQLite format 3 – nicht wirklich') }), 'invalid_backup'],
    [
      'a foreign manifest',
      async () => zipSync({ 'manifest.json': strToU8('{"app":"andere"}'), 'scrumbanize.db': new Uint8Array(fs.readFileSync(path.join(dataDir, 'scrumbanize.db'))) }),
      'invalid_backup',
    ],
    [
      'a newer version',
      async () => {
        const file = path.join(dataDir, 'newer.db');
        const newer = openDatabase(file);
        newer.pragma(`user_version = ${migrations.length + 1}`);
        newer.close();
        return zipSync({ 'scrumbanize.db': new Uint8Array(fs.readFileSync(file)) });
      },
      'backup_too_new',
    ],
  ])('refuses %s and changes nothing', async (_name, build, code) => {
    await createNote('Bleibt');
    const res = await prepare(await build());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(await noteTitles()).toEqual(['Bleibt']);
    expect(fs.existsSync(path.join(dataDir, 'boese.txt'))).toBe(false);
  });

  it('refuses unknown or used tokens, and cancelled ones', async () => {
    expect((await api.post('/api/backup/restore/unbekannt')).body.error.code).toBe('restore_expired');
    const prepared = await prepare(await downloadBackup());
    expect((await api.delete(`/api/backup/restore/${prepared.body.token}`)).status).toBe(204);
    expect((await api.post(`/api/backup/restore/${prepared.body.token}`)).status).toBe(404);
  });
});
