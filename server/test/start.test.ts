import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { io as connect } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/database.js';
import { startServer, type RunningServer } from '../src/start.js';

let dataDir: string;
let running: RunningServer[] = [];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-start-'));
  running = [];
});

afterEach(async () => {
  for (const server of running) await server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function start(options: Partial<Parameters<typeof startServer>[0]> = {}) {
  const server = await startServer({ port: 0, host: '127.0.0.1', dataDir, auth: 'local', ...options });
  running.push(server);
  return server;
}

/** A raw request, so the Host header can be set (fetch does not allow that). */
function request(port: number, options: { path?: string; method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: options.path ?? '/api/health', method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** Occupies a port on 127.0.0.1 until the returned function is called. */
async function occupyPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const blocker = net.createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const port = (blocker.address() as net.AddressInfo).port;
  return { port, release: () => new Promise((resolve) => blocker.close(() => resolve())) };
}

describe('startServer', () => {
  it('opens scrumbanize.db in the data directory and serves the API', async () => {
    const server = await start();
    expect(server.dbFile).toBe(path.join(dataDir, 'scrumbanize.db'));
    expect(fs.existsSync(server.dbFile)).toBe(true);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
    const health = await request(server.port);
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok', version: null, database: 'ok', backups: 'ok' });
    // Backups go next to the database (US-23).
    expect(fs.existsSync(path.join(dataDir, 'backups'))).toBe(true);
  });

  it('falls back to a free port when asked to, and fails otherwise', async () => {
    const busy = await occupyPort();
    try {
      const server = await start({ port: busy.port, fallbackToFreePort: true });
      expect(server.port).not.toBe(busy.port);
      expect((await request(server.port)).status).toBe(200);

      await expect(start({ port: busy.port })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await busy.release();
    }
  });

  it('closes the server and the database, so the port and the file are free again', async () => {
    const server = await start();
    const { port } = server;
    await server.close();
    await server.close(); // twice is fine
    await expect(request(port)).rejects.toMatchObject({ code: 'ECONNREFUSED' });

    // The database file can be opened again, with the data still there.
    const again = await start({ port });
    expect(again.port).toBe(port);
    expect((await request(port, { path: '/api/projects' })).body).toContain('Allgemein');
  });

  it('closes even with an open keep-alive connection', async () => {
    const server = await start();
    const agent = new http.Agent({ keepAlive: true });
    await new Promise<void>((resolve) => http.get({ host: '127.0.0.1', port: server.port, path: '/api/health', agent }, (res) => res.resume().on('end', () => resolve())));
    await server.close(); // would hang without closeAllConnections()
    agent.destroy();
  });

  it("closes even while the app window's live connection is open (US-24)", async () => {
    const server = await start();
    const socket = connect(server.url, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    // The page tries to reconnect, which must not keep the server open.
    await server.close();
    socket.disconnect();
  });

  it('closeNow: closes the database at once, for a computer that is shutting down', async () => {
    const server = await start();
    const socket = connect(server.url, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));

    server.closeNow();
    // Without waiting: the database is closed and checkpointed, so another connection sees no WAL left over.
    expect(fs.existsSync(`${server.dbFile}-wal`) ? fs.statSync(`${server.dbFile}-wal`).size : 0).toBe(0);
    const db = openDatabase(server.dbFile);
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toMatchObject({ n: expect.any(Number) });
    db.close();
    await server.close(); // afterwards a no-op
    socket.disconnect();
  });

  it('requires host 127.0.0.1 for localOnly', async () => {
    await expect(startServer({ port: 0, dataDir, localOnly: true })).rejects.toThrow(/127\.0\.0\.1/);
  });
});

describe('local-only mode (desktop app)', () => {
  it('accepts requests from the app itself', async () => {
    const server = await start({ localOnly: true });
    const own = `127.0.0.1:${server.port}`;
    expect((await request(server.port, { headers: { host: own } })).status).toBe(200);
    expect((await request(server.port, { headers: { host: `localhost:${server.port}` } })).status).toBe(200);
    expect(
      (await request(server.port, { headers: { host: own, origin: `http://${own}`, 'sec-fetch-site': 'same-origin' } })).status,
    ).toBe(200);
  });

  it('rejects other host names (DNS rebinding) and cross-site requests', async () => {
    const server = await start({ localOnly: true });
    const own = `127.0.0.1:${server.port}`;
    const status = async (headers: Record<string, string>, method = 'GET') =>
      (await request(server.port, { headers, method, path: '/api/projects' })).status;

    expect(await status({ host: `evil.example:${server.port}` })).toBe(403);
    expect(await status({ host: '127.0.0.1:1' })).toBe(403);
    expect(await status({ host: own, origin: 'https://evil.example' })).toBe(403);
    expect(await status({ host: own, origin: 'null' }, 'POST')).toBe(403);
    expect(await status({ host: own, 'sec-fetch-site': 'cross-site' })).toBe(403);

    const body = (await request(server.port, { headers: { host: 'evil.example' } })).body;
    expect(JSON.parse(body)).toMatchObject({ error: { code: 'forbidden_origin' } });
  });

  it('is off by default (dev and Docker are reached via other host names)', async () => {
    const server = await start();
    expect((await request(server.port, { headers: { host: 'my-nas.local:3000', origin: 'http://my-nas.local:3000' } })).status).toBe(200);
  });
});

describe('login (US-21)', () => {
  it('announces a setup code when started with login and no administrator, and keeps the API closed', async () => {
    const codes: string[] = [];
    const server = await start({ auth: 'required', onSetupCode: (code) => codes.push(code) });
    expect(codes).toHaveLength(1);
    expect((await request(server.port, { path: '/api/projects' })).status).toBe(401);
    expect((await request(server.port, { path: '/api/health' })).status).toBe(200);
    // The app can ask whether a setup is needed, to show the setup page.
    expect((await request(server.port, { path: '/api/auth/session' })).body).toContain('"setupRequired":true');
  });
});
