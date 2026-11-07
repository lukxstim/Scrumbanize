import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

/** The personal export in the settings: everything one person may see, as one ZIP – for everyone, not only admins. */

let dataDir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
let codes: string[];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-export-'));
  db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
  codes = [];
  app = createApp(db, { auth: 'required', uploadsDir: path.join(dataDir, 'uploads'), onSetupCode: (code) => codes.push(code) });
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const binary = (res: NodeJS.ReadableStream, done: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

async function people() {
  const admin = request.agent(app);
  await admin.post('/api/auth/setup').send({ code: codes.at(-1), name: 'Lukas', email: 'lukas@example.com', password: 'ein langes Passwort' });
  const invitation = await admin.post('/api/admin/invitations').send({ email: 'papa@example.com' });
  const papa = request.agent(app);
  await papa.post('/api/auth/register').send({ token: invitation.body.token, name: 'Papa', password: 'Passwort von Papa' });
  return { admin, papa };
}

describe('personal export', () => {
  it('holds the notebooks, tasks and calendar of the person, and nothing of others', async () => {
    const { admin, papa } = await people();
    const own = (await papa.post('/api/projects').send({ name: 'Garten', color: 'emerald', kind: 'notebook', icon: 'leaf' })).body;
    await papa.post(`/api/projects/${own.id}/notes`).send({ title: 'Tomaten', content: 'Im Mai pflanzen.', tags: ['garten'] });
    const shared = (await admin.post('/api/projects').send({ name: 'Familie', color: 'sky' })).body;
    await admin.post(`/api/projects/${shared.id}/notes`).send({ title: 'Urlaub', content: 'Nach Italien', tags: [] });
    await admin.post(`/api/projects/${shared.id}/tasks`).send({ title: 'Koffer packen', description: '', dueDate: '2026-12-20' });
    await admin.post(`/api/projects/${shared.id}/members`).send({ email: 'papa@example.com', role: 'viewer' });
    const secret = (await admin.post('/api/projects').send({ name: 'Nur Lukas', color: 'red', kind: 'notebook' })).body;
    await admin.post(`/api/projects/${secret.id}/notes`).send({ title: 'Geheim', content: 'x', tags: [] });

    const res = await papa.get('/api/account/export').buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const zip = unzipSync(new Uint8Array(res.body as Buffer));
    const names = Object.keys(zip);
    expect(names).toContain('LIESMICH.txt');
    expect(names).toContain('Notizbücher/Garten/Tomaten.md');
    expect(names).toContain('Notizbücher/Familie/Urlaub.md');
    expect(names).toContain('Aufgaben/Familie.csv');
    expect(names.some((n) => n.includes('Nur Lukas') || n.includes('Geheim'))).toBe(false);
    expect(strFromU8(zip['Notizbücher/Garten/Tomaten.md']!)).toContain('Im Mai pflanzen.');
    const ics = strFromU8(zip['Kalender.ics']!);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Koffer packen');
    expect(strFromU8(zip['LIESMICH.txt']!)).toContain('für Papa');
  });

  it('needs a login', async () => {
    await people();
    expect((await request(app).get('/api/account/export')).status).toBe(401);
  });
});
