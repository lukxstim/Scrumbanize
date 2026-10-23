import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { openDatabase, type Db } from '../src/database.js';

let dir: string;
let clientDist: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumbanize-client-'));
  clientDist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(clientDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>Scrumbanize</title>');
  fs.writeFileSync(path.join(clientDist, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  fs.writeFileSync(path.join(clientDist, 'manifest.webmanifest'), '{"name":"Scrumbanize"}');
  fs.writeFileSync(path.join(clientDist, 'assets', 'index-abc123.js'), 'console.log(1);');
  db = openDatabase(':memory:');
});
afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const app = (desktop = false) =>
  createApp(db, { clientDist, uploadsDir: path.join(dir, 'uploads'), desktop: desktop ? { version: '1.0.0', releasesUrl: 'https://example.org' } : undefined });

describe('the built client (US-25)', () => {
  it('has the page, the service worker and the manifest checked with the server on every load', async () => {
    for (const url of ['/', '/index.html', '/projekte/1/board', '/sw.js', '/manifest.webmanifest']) {
      const res = await request(app()).get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('leaves the caching of hashed assets as it was', async () => {
    const res = await request(app()).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).not.toBe('no-cache');
  });

  it('has no service worker in the desktop app', async () => {
    expect((await request(app(true)).get('/sw.js')).status).toBe(404);
    expect((await request(app(true)).get('/')).status).toBe(200);
  });
});
