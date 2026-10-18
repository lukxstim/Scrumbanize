import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { openDatabase, type Db } from '../src/database.js';
import { createUsersRepository, SESSION_DAYS } from '../src/repositories/usersRepository.js';

let db: Db;
let dataDir: string;
let codes: string[];
let app: ReturnType<typeof createApp>;

const ADMIN = { name: 'Lukas', email: 'lukas@example.com', password: 'ein langes Passwort' };

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-auth-'));
  db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
  codes = [];
  app = createApp(db, { auth: 'required', onSetupCode: (code) => codes.push(code), uploadsDir: path.join(dataDir, 'uploads') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** An agent keeps the session cookie between requests, like a browser. */
async function setUp(agent = request.agent(app)) {
  const res = await agent.post('/api/auth/setup').send({ code: codes.at(-1), ...ADMIN });
  expect(res.status).toBe(201);
  return agent;
}

const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('scrumbanize_session='));

describe('first start', () => {
  it('needs a setup, announces a code once and keeps the API closed', async () => {
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await request(app).get('/api/auth/session')).body).toEqual({ mode: 'required', setupRequired: true, user: null });
    expect(codes).toHaveLength(1);

    expect((await request(app).get('/api/health')).status).toBe(200);
    for (const [method, url] of [
      ['get', '/api/projects'],
      ['get', '/api/meta'],
      ['get', '/api/backup'],
      ['post', '/api/projects'],
      ['get', '/api/search?q=x'],
    ] as const) {
      const res = await request(app)[method](url);
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    }
  });

  it('sets up the first administrator with the code: logged in, owner of the existing projects', async () => {
    const wrong = await request(app).post('/api/auth/setup').send({ code: 'AAAA-AAAA', ...ADMIN });
    expect(wrong.status).toBe(403);

    // Case and dash do not matter.
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ code: codes[0]!.toLowerCase().replace('-', ''), ...ADMIN, email: ' Lukas@Example.com ' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Lukas', email: 'lukas@example.com', systemRole: 'admin', avatarUrl: null });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(cookieOf(res)).toMatch(/HttpOnly/);
    expect(cookieOf(res)).toMatch(/SameSite=Lax/);

    expect(db.prepare(`SELECT project_id, role FROM project_members WHERE user_id = ?`).all(res.body.user.id)).toEqual([
      { project_id: 1, role: 'owner' },
    ]);
    // The password is stored as an Argon2id hash only.
    const stored = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(res.body.user.id) as { password_hash: string };
    expect(stored.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('happens only once', async () => {
    await setUp();
    const again = await request(app).post('/api/auth/setup').send({ code: codes[0], ...ADMIN, email: 'zweite@example.com' });
    expect(again.status).toBe(409);
    expect((await request(app).get('/api/auth/session')).body.setupRequired).toBe(false);
  });

  it('rejects weak or malformed input', async () => {
    for (const body of [
      { ...ADMIN, password: 'kurz' },
      { ...ADMIN, email: 'keine-adresse' },
      { ...ADMIN, name: '  ' },
    ]) {
      expect((await request(app).post('/api/auth/setup').send({ code: codes[0], ...body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('stops guessing the setup code', async () => {
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/setup').send({ code: 'AAAA-AAAA', ...ADMIN });
    const blocked = await request(app).post('/api/auth/setup').send({ code: codes[0], ...ADMIN });
    expect(blocked.status).toBe(429);
  });
});

describe('login and sessions', () => {
  it('opens the API to a logged-in user and closes it again on logout', async () => {
    const agent = await setUp();
    expect((await agent.get('/api/projects')).status).toBe(200);
    expect((await agent.get('/api/auth/session')).body).toMatchObject({ mode: 'required', setupRequired: false, user: { email: ADMIN.email } });

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(204);
    expect(cookieOf(logout)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await agent.get('/api/projects')).status).toBe(401);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get()).toEqual({ n: 0 });
  });

  it('logs in with email (any case) and password, and gives the same answer for unknown emails', async () => {
    await setUp();
    const agent = request.agent(app);
    const wrong = await agent.post('/api/auth/login').send({ email: ADMIN.email, password: 'falsches Passwort' });
    const unknown = await agent.post('/api/auth/login').send({ email: 'niemand@example.com', password: ADMIN.password });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);

    const ok = await agent.post('/api/auth/login').send({ email: 'LUKAS@example.com', password: ADMIN.password });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ email: ADMIN.email });
    expect((await agent.get('/api/projects')).status).toBe(200);
  });

  it('blocks an account and an address after 10 failed attempts', async () => {
    await setUp();
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: `falsch ${i}` });
    const blocked = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('too_many_attempts');
  });

  it('does not let disabled accounts or the local user in', async () => {
    await setUp();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    db.prepare(`UPDATE users SET disabled_at = ? WHERE email = ?`).run(new Date().toISOString(), ADMIN.email);
    expect((await agent.get('/api/projects')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password })).status).toBe(401);

    createUsersRepository(db).localUser();
    const local = await request(app).post('/api/auth/login').send({ email: 'local@scrumbanize.invalid', password: '' });
    expect(local.status).toBe(401);
  });

  it('lasts 30 days from the last request', () => {
    const users = createUsersRepository(db);
    const user = users.localUser();
    db.prepare(`UPDATE users SET password_hash = 'x' WHERE id = ?`).run(user.id);
    const start = new Date('2026-10-01T10:00:00Z');
    const { token, expiresAt } = users.createSession(user.id, 'Test', start);
    expect(expiresAt.toISOString()).toBe('2026-10-31T10:00:00.000Z');

    // Within a minute nothing is written; later the session moves on.
    expect(users.sessionUser(token, new Date('2026-10-01T10:00:30Z'))?.renewed).toBeUndefined();
    const later = users.sessionUser(token, new Date('2026-10-20T10:00:00Z'));
    expect(later?.renewed?.toISOString()).toBe(new Date(Date.parse('2026-10-20T10:00:00Z') + SESSION_DAYS * 86_400_000).toISOString());
    // Renewed on 20 October, so still valid after the first 30 days.
    expect(users.sessionUser(token, new Date('2026-11-18T10:00:00Z'))).toBeDefined();
    // 30 days without a request: over.
    expect(users.sessionUser(token, new Date('2027-01-01T10:00:00Z'))).toBeUndefined();
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get()).toEqual({ n: 0 });
  });

  it('stores only a hash of the session token', async () => {
    const res = await setUp().then((agent) => agent.post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password }));
    const token = decodeURIComponent(cookieOf(res)!.split(';')[0]!.split('=')[1]!);
    const stored = (db.prepare(`SELECT token_hash FROM sessions`).all() as { token_hash: string }[]).map((r) => r.token_hash);
    expect(stored).not.toContain(token);
    expect(stored.every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });

  it('makes whoever creates a project its owner', async () => {
    const agent = await setUp();
    const project = (await agent.post('/api/projects').send({ name: 'Familie', color: 'sky' })).body;
    expect(db.prepare(`SELECT u.email, m.role FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ?`).all(project.id)).toEqual([
      { email: ADMIN.email, role: 'owner' },
    ]);
  });
});

describe('cross-site requests', () => {
  it('refuses changes from other sites, also with a valid session', async () => {
    const agent = await setUp();
    const post = (headers: Record<string, string>) => agent.post('/api/projects').set(headers).send({ name: `P${Math.random()}`, color: 'sky' });
    expect((await post({ Origin: 'https://boese.example' })).status).toBe(403);
    expect((await post({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({ 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
    // The login form of another site cannot log the browser in either.
    expect((await request(app).post('/api/auth/login').set('Origin', 'https://boese.example').send({ email: ADMIN.email, password: ADMIN.password })).status).toBe(403);

    // The app's own page (same origin as the request) and requests without Origin are fine; reading is always fine.
    const res = await agent.get('/api/projects').set('Origin', 'https://boese.example');
    expect(res.status).toBe(200);
    expect((await post({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(201);
    expect((await post({})).status).toBe(201);
  });

  it('accepts the configured BASE_URL', async () => {
    db.close();
    db = openDatabase(path.join(dataDir, 'scrumbanize.db'));
    app = createApp(db, { auth: 'required', onSetupCode: (code) => codes.push(code), allowedOrigins: ['https://scrumbanize.example.org'] });
    const agent = await setUp();
    const res = await agent.post('/api/projects').set('Origin', 'https://scrumbanize.example.org').send({ name: 'Über Proxy', color: 'sky' });
    expect(res.status).toBe(201);
  });
});

describe('without login (desktop app, AUTH=off)', () => {
  it('lets everyone in as the local user and has no login', async () => {
    const local = createApp(db, { auth: 'local' });
    const session = (await request(local).get('/api/auth/session')).body;
    expect(session).toMatchObject({ mode: 'local', setupRequired: false, user: { name: 'Ich', systemRole: 'admin' } });
    expect((await request(local).get('/api/projects')).status).toBe(200);
    expect((await request(local).post('/api/auth/login').send({ email: 'x', password: 'y' })).status).toBe(409);
    expect((await request(local).post('/api/auth/setup').send({ code: 'x', ...ADMIN })).status).toBe(409);
  });

  it('needs a setup when such a database moves to a server with login', async () => {
    createUsersRepository(db).localUser();
    expect((await request(app).get('/api/auth/session')).body.setupRequired).toBe(true);
    await setUp();
    expect((await request(app).get('/api/auth/session')).body.setupRequired).toBe(false);
  });
});

describe('backups', () => {
  it('never contain sessions', async () => {
    const agent = await setUp();
    const res = await agent.get('/api/backup').buffer(true).parse((stream, done) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const file = path.join(dataDir, 'aus-backup.db');
    fs.writeFileSync(file, unzipSync(new Uint8Array(res.body as Buffer))['scrumbanize.db']!);
    const copy = new Database(file, { readonly: true });
    expect(copy.prepare(`SELECT COUNT(*) AS n FROM sessions`).get()).toEqual({ n: 0 });
    expect(copy.prepare(`SELECT email FROM users`).all()).toEqual([{ email: ADMIN.email }]);
    copy.close();
    // The live sessions are untouched.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get()).toEqual({ n: 1 });
  });
});

describe('password hashes', () => {
  it('check Argon2id and scrypt hashes and refuse anything else', async () => {
    const argon = await hashPassword('Geheimnis 123');
    const scrypt = await hashPassword('Geheimnis 123', { forceScrypt: true });
    expect(scrypt).toMatch(/^\$scrypt\$N=131072,r=8,p=1\$/);
    for (const hash of [argon, scrypt]) {
      expect(await verifyPassword('Geheimnis 123', hash)).toBe(true);
      expect(await verifyPassword('Geheimnis 124', hash)).toBe(false);
    }
    expect(await hashPassword('Geheimnis 123')).not.toBe(argon);
    for (const garbage of ['', 'klartext', '$argon2id$v=19$m=1$xx$yy', '$scrypt$N=2$a$b']) {
      expect(await verifyPassword('Geheimnis 123', garbage)).toBe(false);
    }
  });
});
