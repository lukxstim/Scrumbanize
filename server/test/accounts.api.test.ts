import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';
import { createAttachmentsRepository } from '../src/repositories/attachmentsRepository.js';

/** US-21c: own account, profile pictures, invitations, password resets, user management, restoring desktop backups. */

let dataDir: string;
let uploadsDir: string;
let db: Db;
let app: ReturnType<typeof createApp>;
let codes: string[];

const ADMIN = { name: 'Lukas', email: 'lukas@example.com', password: 'ein langes Passwort' };
// The smallest valid PNG (1 × 1 pixel).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-accounts-'));
  uploadsDir = path.join(dataDir, 'uploads');
  db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
  codes = [];
  app = createApp(db, { auth: 'required', uploadsDir, onSetupCode: (code) => codes.push(code) });
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

async function admin() {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/setup').send({ code: codes.at(-1), ...ADMIN })).status).toBe(201);
  return agent;
}

/** Invites `email` and accepts the invitation; returns the new person's logged-in agent and id. */
async function invited(adminAgent: request.Agent, email: string, name = email.split('@')[0]!) {
  const invitation = await adminAgent.post('/api/admin/invitations').send({ email });
  expect(invitation.status).toBe(201);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ token: invitation.body.token, name, password: 'Passwort von ' + name });
  expect(res.status).toBe(201);
  return { agent, id: res.body.user.id as number };
}

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

describe('own account', () => {
  it('changes name and color', async () => {
    const agent = await admin();
    const res = await agent.patch('/api/account').send({ name: 'Lukas B.', avatarColor: 'emerald' });
    expect(res.body.user).toMatchObject({ name: 'Lukas B.', avatarColor: 'emerald', email: ADMIN.email });
    expect((await agent.patch('/api/account').send({ avatarColor: 'gold' })).status).toBe(400);
    expect((await agent.get('/api/auth/session')).body.user.name).toBe('Lukas B.');
  });

  it('changes the password with the current one and ends the other sessions', async () => {
    const agent = await admin();
    const laptop = request.agent(app);
    await laptop.post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });

    expect((await agent.post('/api/account/password').send({ current: 'falsch falsch', password: 'ganz neues Passwort' })).body.error.code).toBe('wrong_password');
    expect((await agent.post('/api/account/password').send({ current: ADMIN.password, password: 'kurz' })).status).toBe(400);
    expect((await agent.post('/api/account/password').send({ current: ADMIN.password, password: 'ganz neues Passwort' })).status).toBe(204);

    // This browser stays logged in, the laptop is out.
    expect((await agent.get('/api/projects')).status).toBe(200);
    expect((await laptop.get('/api/projects')).status).toBe(401);
    expect((await login(ADMIN.email, ADMIN.password)).status).toBe(401);
    expect((await login(ADMIN.email, 'ganz neues Passwort')).status).toBe(200);
  });
});

describe('profile pictures', () => {
  it('are PNG, JPEG or WebP by their content, at most 2 MB', async () => {
    const agent = await admin();
    const put = (body: Buffer, type = 'image/png') => agent.put('/api/account/avatar').set('Content-Type', type).send(body);
    expect((await put(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml')).status).toBe(415);
    expect((await put(Buffer.from('GIF89a......'))).status).toBe(415);
    expect((await put(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).status).toBe(413);

    const res = await put(PNG);
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/^\/api\/users\/\d+\/avatar\?v=avatar-[0-9a-f-]+\.png$/);
    const file = await agent.get(res.body.user.avatarUrl).buffer(true).parse(binary);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
  });

  it('replace and remove their file, and survive the cleanup of uploads', async () => {
    const agent = await admin();
    const first = (await agent.put('/api/account/avatar').set('Content-Type', 'image/png').send(PNG)).body.user.avatarUrl as string;
    const second = (await agent.put('/api/account/avatar').set('Content-Type', 'image/png').send(PNG)).body.user.avatarUrl as string;
    expect(second).not.toBe(first);
    const files = () => fs.readdirSync(uploadsDir).filter((f) => f.startsWith('avatar-'));
    expect(files()).toEqual([decodeURIComponent(second.split('v=')[1]!)]);

    createAttachmentsRepository(db, uploadsDir).sweep();
    expect(files()).toHaveLength(1);

    expect((await agent.delete('/api/account/avatar')).body.user.avatarUrl).toBeNull();
    expect(files()).toEqual([]);
  });

  it('are shown to people who share a project, not to strangers', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com');
    const tom = await invited(lukas, 'tom@example.com');
    const url = (await anna.agent.put('/api/account/avatar').set('Content-Type', 'image/png').send(PNG)).body.user.avatarUrl as string;

    expect((await tom.agent.get(url)).status).toBe(404);
    expect((await lukas.get(url)).status).toBe(200); // administrator
    await lukas.post('/api/projects/1/members').send({ email: 'anna@example.com', role: 'viewer' });
    await lukas.post('/api/projects/1/members').send({ email: 'tom@example.com', role: 'viewer' });
    expect((await tom.agent.get(url)).status).toBe(200);
  });

  it('are part of backups', async () => {
    const agent = await admin();
    const url = (await agent.put('/api/account/avatar').set('Content-Type', 'image/png').send(PNG)).body.user.avatarUrl as string;
    const zip = unzipSync(new Uint8Array((await agent.get('/api/backup').buffer(true).parse(binary)).body as Buffer));
    expect(Object.keys(zip)).toContain(`uploads/${decodeURIComponent(url.split('v=')[1]!)}`);
  });
});

describe('invitations', () => {
  it('let someone create their own account with the invited email, once', async () => {
    const lukas = await admin();
    const invitation = (await lukas.post('/api/admin/invitations').send({ email: ' Anna@Example.com ' })).body;
    expect(invitation).toMatchObject({ email: 'anna@example.com', token: expect.any(String) });
    expect(Date.parse(invitation.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect((await lukas.get('/api/admin/invitations')).body).toMatchObject([{ email: 'anna@example.com', createdBy: 'Lukas' }]);

    expect((await request(app).get(`/api/auth/invitation/${invitation.token}`)).body).toEqual({ email: 'anna@example.com' });
    const anna = request.agent(app);
    const res = await anna.post('/api/auth/register').send({ token: invitation.token, name: 'Anna', password: 'Annas Passwort 1' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'anna@example.com', name: 'Anna', systemRole: 'user' });
    // Logged in, in no project yet.
    expect((await anna.get('/api/projects')).body).toEqual([]);

    expect((await request(app).post('/api/auth/register').send({ token: invitation.token, name: 'Nochmal', password: 'Annas Passwort 2' })).status).toBe(410);
    expect((await request(app).get(`/api/auth/invitation/${invitation.token}`)).status).toBe(410);
    expect((await lukas.get('/api/admin/invitations')).body).toEqual([]);
    expect((await lukas.post('/api/admin/invitations').send({ email: 'anna@example.com' })).body.error.code).toBe('email_taken');
  });

  it('expire after 7 days and can be revoked', async () => {
    const lukas = await admin();
    const old = (await lukas.post('/api/admin/invitations').send({ email: 'alt@example.com' })).body;
    db.prepare(`UPDATE auth_tokens SET expires_at = '2020-01-01T00:00:00.000Z'`).run();
    expect((await request(app).get(`/api/auth/invitation/${old.token}`)).status).toBe(410);

    const fresh = (await lukas.post('/api/admin/invitations').send({ email: 'neu@example.com' })).body;
    const [listed] = (await lukas.get('/api/admin/invitations')).body;
    expect((await lukas.delete(`/api/admin/invitations/${listed.id}`)).status).toBe(204);
    expect((await request(app).post('/api/auth/register').send({ token: fresh.token, name: 'Neu', password: 'neues Passwort 1' })).status).toBe(410);
  });

  it('are made by administrators only', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com');
    expect((await anna.agent.post('/api/admin/invitations').send({ email: 'x@example.com' })).status).toBe(403);
    expect((await anna.agent.get('/api/admin/users')).status).toBe(403);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });
});

describe('password reset links', () => {
  it('set a new password once and end every session of the account', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com', 'Anna');
    const link = (await lukas.post(`/api/admin/users/${anna.id}/reset-link`)).body;
    expect(Date.parse(link.expiresAt) - Date.now()).toBeLessThanOrEqual(86_400_000);
    expect((await request(app).get(`/api/auth/reset/${link.token}`)).body).toEqual({ email: 'anna@example.com', name: 'Anna' });

    const browser = request.agent(app);
    const res = await browser.post('/api/auth/reset').send({ token: link.token, password: 'Annas neues Passwort' });
    expect(res.status).toBe(200);
    expect((await browser.get('/api/auth/session')).body.user.email).toBe('anna@example.com');
    expect((await anna.agent.get('/api/projects')).status).toBe(401);
    expect((await login('anna@example.com', 'Annas neues Passwort')).status).toBe(200);
    expect((await request(app).post('/api/auth/reset').send({ token: link.token, password: 'noch ein anderes' })).status).toBe(410);
  });

  it('replace earlier links of the account', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com');
    const first = (await lukas.post(`/api/admin/users/${anna.id}/reset-link`)).body.token;
    const second = (await lukas.post(`/api/admin/users/${anna.id}/reset-link`)).body.token;
    expect((await request(app).get(`/api/auth/reset/${first}`)).status).toBe(410);
    expect((await request(app).get(`/api/auth/reset/${second}`)).status).toBe(200);
  });
});

describe('user management', () => {
  it('lists the accounts with the projects only they own', async () => {
    const lukas = await admin();
    await invited(lukas, 'anna@example.com', 'Anna');
    const users = (await lukas.get('/api/admin/users')).body as { email: string; systemRole: string; disabled: boolean; soleOwnerOf: { name: string }[] }[];
    expect(users.map((u) => [u.email, u.systemRole, u.disabled, u.soleOwnerOf.map((p) => p.name)])).toEqual([
      ['anna@example.com', 'user', false, []],
      ['lukas@example.com', 'admin', false, ['Allgemein']],
    ]);
    expect(users[0]).not.toHaveProperty('passwordHash');
  });

  it('disables accounts only after their projects have another owner', async () => {
    const lukas = await admin();
    const anna = await invited(lukas, 'anna@example.com', 'Anna');
    const tom = await invited(lukas, 'tom@example.com', 'Tom');
    await anna.agent.post('/api/projects').send({ name: 'Annas Projekt', color: 'pink' });

    const refused = await lukas.patch(`/api/admin/users/${anna.id}`).send({ disabled: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'sole_owner', message: 'Only owner of: Annas Projekt' });

    const handed = await lukas.post(`/api/admin/users/${anna.id}/hand-over`).send({ toUserId: tom.id });
    expect(handed.body.projects).toBe(1);
    expect((await tom.agent.get('/api/projects')).body.map((p: { name: string; role: string }) => `${p.name}:${p.role}`)).toEqual(['Annas Projekt:owner']);

    const disabled = await lukas.patch(`/api/admin/users/${anna.id}`).send({ disabled: true });
    expect(disabled.body).toMatchObject({ disabled: true });
    expect((await anna.agent.get('/api/projects')).status).toBe(401);
    expect((await login('anna@example.com', 'Passwort von Anna')).status).toBe(401);
    expect((await lukas.post(`/api/admin/users/${anna.id}/reset-link`)).body.error.code).toBe('disabled');

    // Back again.
    await lukas.patch(`/api/admin/users/${anna.id}`).send({ disabled: false });
    expect((await login('anna@example.com', 'Passwort von Anna')).status).toBe(200);
  });

  it('always keeps an administrator', async () => {
    const lukas = await admin();
    const me = (await lukas.get('/api/auth/session')).body.user.id;
    expect((await lukas.patch(`/api/admin/users/${me}`).send({ systemRole: 'user' })).body.error.code).toBe('last_admin');
    expect((await lukas.patch(`/api/admin/users/${me}`).send({ disabled: true })).status).toBe(409);

    const anna = await invited(lukas, 'anna@example.com');
    await lukas.patch(`/api/admin/users/${anna.id}`).send({ systemRole: 'admin' });
    expect((await anna.agent.get('/api/admin/users')).status).toBe(200);
    expect((await lukas.patch(`/api/admin/users/${me}`).send({ systemRole: 'user' })).status).toBe(200);
    expect((await lukas.get('/api/admin/users')).status).toBe(403);
  });
});

describe('restoring a backup without administrator', () => {
  it('keeps the restoring administrator, as owner of everything restored', async () => {
    // A backup from the desktop app: no accounts but the local user.
    const desktopDir = path.join(dataDir, 'desktop');
    const desktopDb = openDatabase(path.join(desktopDir, 'scrumbanize.db'));
    const desktop = createApp(desktopDb, { auth: 'local', uploadsDir: path.join(desktopDir, 'uploads') });
    await request(desktop).post('/api/projects').send({ name: 'Vom Desktop', color: 'sky' });
    const zip = (await request(desktop).get('/api/backup').buffer(true).parse(binary)).body as Buffer;
    desktopDb.close();

    const lukas = await admin();
    const prepared = await lukas.post('/api/backup/restore').attach('file', zip, 'desktop.zip');
    const applied = await lukas.post(`/api/backup/restore/${prepared.body.token}`);
    expect(applied.status).toBe(200);
    expect(applied.body.keptAdmin).toBe(true);

    // Logged out like everyone, but the same email and password work, and the restored projects are Lukas's.
    expect((await lukas.get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/auth/session')).body.setupRequired).toBe(false);
    const again = request.agent(app);
    await again.post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(((await again.get('/api/projects')).body as { name: string; role: string }[]).map((p) => `${p.name}:${p.role}`)).toEqual([
      'Allgemein:owner',
      'Vom Desktop:owner',
    ]);
  });

  it('leaves a backup with its own administrators as it is', async () => {
    const lukas = await admin();
    const zip = (await lukas.get('/api/backup').buffer(true).parse(binary)).body as Buffer;
    const prepared = await lukas.post('/api/backup/restore').attach('file', zip, 'backup.zip');
    expect((await lukas.post(`/api/backup/restore/${prepared.body.token}`)).body.keptAdmin).toBe(false);
    const raw = new Database(path.join(dataDir, 'scrumbanize.db'), { readonly: true });
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM users`).get()).toEqual({ n: 1 });
    raw.close();
  });
});
