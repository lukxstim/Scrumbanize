import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

/** US-33: the calendar subscription – a secret link per user with the tasks that have a date. */

let dataDir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
let codes: string[];

const ADMIN = { name: 'Lukas', email: 'lukas@example.com', password: 'ein langes Passwort' };

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-calendar-'));
  db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
  codes = [];
  app = createApp(db, { auth: 'required', uploadsDir: path.join(dataDir, 'uploads'), onSetupCode: (code) => codes.push(code) });
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function admin() {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/setup').send({ code: codes.at(-1), ...ADMIN })).status).toBe(201);
  return agent;
}

async function invited(adminAgent: request.Agent, email: string) {
  const invitation = await adminAgent.post('/api/admin/invitations').send({ email });
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ token: invitation.body.token, name: email.split('@')[0], password: 'Passwort von ' + email });
  expect(res.status).toBe(201);
  return agent;
}

/** The feed as a calendar app fetches it: no cookie. */
const fetchFeed = (token: string) => request(app).get(`/api/calendar/feed/${token}.ics`);
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('calendar subscription', () => {
  it('makes a link whose feed holds the tasks with a date, as all-day events', async () => {
    const agent = await admin();
    expect((await agent.get('/api/account/calendar')).body).toEqual({ feed: null });
    await agent.post('/api/projects/1/tasks').send({ title: 'Angebot schreiben, schnell', description: '', dueDate: '2026-11-20', priority: 'high' });
    await agent.post('/api/projects/1/tasks').send({ title: 'Umzug', description: '', startDate: '2026-12-01', dueDate: '2026-12-03' });
    await agent.post('/api/projects/1/tasks').send({ title: 'Ohne Datum', description: '' });

    const made = await agent.post('/api/account/calendar');
    expect(made.status).toBe(201);
    expect(made.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await agent.get('/api/account/calendar')).body.feed).toEqual({ createdAt: made.body.createdAt });

    const res = await fetchFeed(made.body.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['cache-control']).toBe('private, no-cache');
    const ics = unfold(res.text);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('SUMMARY:Angebot schreiben\\, schnell');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261204');
    expect(ics).toContain('Priorität: Hoch');
    expect(ics).toMatch(/URL:http:\/\/127\.0\.0\.1:\d+\/p\/1\/tasks\/\d+/);
    expect(ics).not.toContain('Ohne Datum');
  });

  it('shows only the projects the owner of the link may see', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com');
    await lukas.post('/api/projects/1/tasks').send({ title: 'Nur für Lukas', description: '', dueDate: '2026-11-20' });
    const token = (await anna.post('/api/account/calendar')).body.token as string;
    expect(unfold((await fetchFeed(token)).text)).not.toContain('Nur für Lukas');

    await lukas.post('/api/projects/1/members').send({ email: 'anna@example.com', role: 'viewer' });
    expect(unfold((await fetchFeed(token)).text)).toContain('Nur für Lukas');
  });

  it('ends the old link when a new one is made or the link is revoked', async () => {
    const agent = await admin();
    const first = (await agent.post('/api/account/calendar')).body.token as string;
    const second = (await agent.post('/api/account/calendar')).body.token as string;
    expect(second).not.toBe(first);
    expect((await fetchFeed(first)).status).toBe(404);
    expect((await fetchFeed(second)).status).toBe(200);

    expect((await agent.delete('/api/account/calendar')).status).toBe(204);
    expect((await fetchFeed(second)).status).toBe(404);
    expect((await agent.get('/api/account/calendar')).body).toEqual({ feed: null });
  });

  it('needs a login to make a link, and wrong tokens count like failed logins', async () => {
    await admin();
    expect((await request(app).post('/api/account/calendar')).status).toBe(401);
    expect((await request(app).get('/api/calendar/feed/kurz.ics')).status).toBe(404);
    for (let i = 0; i < 9; i++) await fetchFeed('A'.repeat(43));
    expect((await fetchFeed('A'.repeat(43))).status).toBe(429);
  });

  it('stops working for a disabled person', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com');
    const token = (await anna.post('/api/account/calendar')).body.token as string;
    const annaId = (await anna.get('/api/auth/session')).body.user.id as number;
    db.prepare(`UPDATE users SET disabled_at = ? WHERE id = ?`).run(new Date().toISOString(), annaId);
    expect((await fetchFeed(token)).status).toBe(404);
  });

  it('is not part of backups', async () => {
    const agent = await admin();
    await agent.post('/api/account/calendar');
    const zip = unzipSync(new Uint8Array((await agent.get('/api/backup').buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })).body as Buffer));
    const file = path.join(dataDir, 'restored.db');
    fs.writeFileSync(file, zip['scrumbanize.db']!);
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare(`SELECT COUNT(*) AS n FROM calendar_feeds`).get()).toEqual({ n: 0 });
    copy.close();
  });
});

describe('calendar subscription without login', () => {
  it('works for the local user', async () => {
    const local = createApp(db, { auth: 'local', uploadsDir: path.join(dataDir, 'uploads') });
    const token = (await request(local).post('/api/account/calendar')).body.token as string;
    expect((await request(local).get(`/api/calendar/feed/${token}.ics`)).status).toBe(200);
    // The same database behind a server with logins: the local user's link opens nothing there.
    expect((await fetchFeed(token)).status).toBe(404);
  });
});
